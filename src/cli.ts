#!/usr/bin/env node

import { Command } from "commander";
import { readFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { createInterface } from "readline/promises";
import { LLMClient } from "./llm/client.js";
import { runOrchestrator } from "./agent/orchestrator.js";
import { scrapeJobPosting } from "./tools/scraper.js";
import { parseFile } from "./utils/file-parser.js";
import { logger } from "./utils/logger.js";
import { loadAllRuns } from "./utils/run-loader.js";
import { writeRunOutputs } from "./utils/output-writer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUTPUT_ROOT = join(__dirname, "../output");

const program = new Command();

async function promptForJDText(): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const jdText = await rl.question("Paste the full job description text, then press Enter:\n");
  rl.close();

  return jdText.trim();
}

program
  .name("jobfit")
  .description("AI-powered job application analyzer")
  .version("1.0.0");

// --- analyze ---

program
  .command("analyze")
  .description("Analyze a job posting against your resume")
  .argument("<source>", "Job posting URL or path to JD text file")
  .requiredOption("--resume <path>", "Path to resume file (.txt, .md, .pdf, .docx)")
  .option("--mock", "Use mock LLM (no API calls)", false)
  .option("--verbose, -v", "Show detailed logs", false)
  .option("--output <dir>", "Custom output directory")
  .action(async (source: string, opts: { resume: string; mock: boolean; verbose: boolean; output?: string }) => {
    if (opts.mock) process.env.MOCK_LLM = "true";
    if (opts.verbose) logger.configure({ level: "debug", verbose: true });

    console.log("╔══════════════════════════════════════╗");
    console.log("║       JobFit Agent — Analyzer        ║");
    console.log("╚══════════════════════════════════════╝\n");

    // 1. Load JD text
    let jdText: string;
    const isUrl = source.startsWith("http://") || source.startsWith("https://");

    if (isUrl) {
      console.log(`🌐 Scraping job posting: ${source}`);
      try {
        const scrapeResult = await scrapeJobPosting(source);
        jdText = scrapeResult.text;
      } catch (error: any) {
        console.warn(`⚠ Scraping failed: ${error.message}`);
        if (!process.stdin.isTTY) {
          throw new Error("Scraping failed in non-interactive mode. Provide a JD text file path instead of URL.");
        }

        jdText = await promptForJDText();
        if (!jdText) {
          throw new Error("Job description text is required after scraping fallback.");
        }
        console.log(`📋 Using pasted JD text (${jdText.length} chars)`);
      }
    } else {
      const jdPath = resolve(source);
      if (!existsSync(jdPath)) {
        console.error(`✗ JD file not found: ${jdPath}`);
        process.exit(1);
      }
      jdText = readFileSync(jdPath, "utf-8");
      console.log(`📂 JD loaded: ${jdPath} (${jdText.length} chars)`);
    }

    // 2. Load resume
    const resumePath = resolve(opts.resume);
    if (!existsSync(resumePath)) {
      console.error(`✗ Resume file not found: ${resumePath}`);
      process.exit(1);
    }

    let resumeText: string;
    const ext = resumePath.split(".").pop()?.toLowerCase();
    if (ext === "pdf" || ext === "docx") {
      const parsed = await parseFile(resumePath);
      resumeText = parsed.text;
      console.log(`📂 Resume loaded: ${resumePath} (${parsed.charCount} chars, ${parsed.format})`);
    } else {
      resumeText = readFileSync(resumePath, "utf-8");
      console.log(`📂 Resume loaded: ${resumePath} (${resumeText.length} chars)`);
    }

    // 3. Run orchestrator
    const llm = new LLMClient({
      model: "claude-sonnet-4-5-20250929",
      maxRetries: 2,
      maxTokens: 4096,
    });

    const result = await runOrchestrator(jdText, resumeText, llm, (state) => {
      console.log(`  → State: ${state}`);
    });
    const ctx = result.context;

    // 4. Save outputs
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const company = (ctx.parsedJD?.company ?? "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const role = (ctx.parsedJD?.role ?? "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const outputDir = opts.output
      ? resolve(opts.output)
      : join(OUTPUT_ROOT, `${dateStr}_${company}_${role}`);

    writeRunOutputs(outputDir, ctx, {
      timestamp: now.toISOString(),
      success: result.success,
      totalDurationMs: result.totalDurationMs,
      jdSource: source,
      resumeSource: opts.resume,
      tokenUsage: result.tokenUsage,
    });

    // 5. Summary
    console.log("\n═══════════════════════════════════════");
    console.log(`${result.success ? "✅" : "❌"} Analysis ${result.success ? "complete" : "failed"}! Files saved to:\n   ${outputDir}/\n`);
    console.log(`   📊 Fit Score: ${ctx.fitAnalysis?.overallScore}/100`);
    console.log(
      `   ✅ Strong matches: ${ctx.fitAnalysis?.strongMatches.length}  |  ⚠️ Gaps: ${ctx.fitAnalysis?.gaps.length}  |  🎯 Reframe: ${ctx.fitAnalysis?.reframingSuggestions.length}`
    );
    console.log(`\n   Generated:`);
    console.log(`   - analysis.json       (Full structured data)`);
    console.log(`   - fit-report.md       ${ctx.parsedJD && ctx.fitAnalysis ? "✓" : "✗"}`);
    console.log(`   - cover-letter.md     ${ctx.outputs.coverLetter ? "✓" : "✗"}`);
    console.log(`   - tailored-bullets.md ${ctx.outputs.tailoredBullets ? "✓" : "✗"}`);
    console.log(`   - interview-prep.md   ${ctx.outputs.interviewPrep ? "✓" : "✗"}`);
    console.log(`   - metadata.json       (Run metadata & costs)`);
    console.log(`   - logs.json           (Structured logs)`);
    console.log(`\n   📝 Validation: ${ctx.validation?.passed ? "PASSED" : "ISSUES"} (${ctx.validationAttempts} attempt${ctx.validationAttempts > 1 ? "s" : ""})`);
    if (ctx.validation && !ctx.validation.passed) {
      for (const issue of ctx.validation.issues) {
        console.log(`      - ${issue}`);
      }
    }
    console.log(`   ⏱  Duration: ${result.totalDurationMs}ms`);
    const totalTokens = result.tokenUsage.totalInputTokens + result.tokenUsage.totalOutputTokens;
    console.log(`   💰 Tokens: ${totalTokens} (~$${result.tokenUsage.estimatedCost.toFixed(4)})`);
    console.log("═══════════════════════════════════════");
  });

// --- list ---

program
  .command("list")
  .description("List all tracked job applications")
  .option("--sort <field>", "Sort by: date, score, cost", "date")
  .action((opts: { sort: string }) => {
    const runs = loadAllRuns(OUTPUT_ROOT);

    if (runs.length === 0) {
      console.log("No analysis runs found in output/");
      return;
    }

    // Sort
    if (opts.sort === "score") {
      runs.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    } else if (opts.sort === "cost") {
      runs.sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0));
    } else {
      runs.sort((a, b) => b.date.localeCompare(a.date));
    }

    console.log("╔══════════════════════════════════════════════════════════════════╗");
    console.log("║                   JobFit Agent — Applications                   ║");
    console.log("╚══════════════════════════════════════════════════════════════════╝\n");

    console.log(
      padEnd("Date", 12) +
      padEnd("Company", 22) +
      padEnd("Role", 25) +
      padEnd("Score", 7) +
      padEnd("Cost", 10) +
      "Valid"
    );
    console.log("─".repeat(82));

    for (const run of runs) {
      console.log(
        padEnd(run.date, 12) +
        padEnd(truncate(run.company, 20), 22) +
        padEnd(truncate(run.role, 23), 25) +
        padEnd(run.score != null ? `${run.score}/100` : "—", 7) +
        padEnd(run.cost != null ? `$${run.cost.toFixed(4)}` : "—", 10) +
        (run.validated === true ? "✓" : run.validated === false ? "✗" : "—")
      );
    }

    console.log(`\n${runs.length} application${runs.length > 1 ? "s" : ""} tracked`);
  });

// --- compare ---

program
  .command("compare")
  .description("Compare fit analysis across multiple job applications")
  .argument("<dirs...>", "Output directory names to compare (from output/)")
  .action((dirs: string[]) => {
    if (dirs.length < 2) {
      console.error("Please provide at least 2 directories to compare.");
      process.exit(1);
    }

    console.log("╔══════════════════════════════════════════════════════════════════╗");
    console.log("║                  JobFit Agent — Comparison                      ║");
    console.log("╚══════════════════════════════════════════════════════════════════╝\n");

    const analyses: { dir: string; company: string; role: string; score: number; matches: number; gaps: number; advantages: string[] }[] = [];

    for (const dir of dirs) {
      const fullPath = dir.startsWith("/") ? dir : join(OUTPUT_ROOT, dir);
      const analysisPath = join(fullPath, "analysis.json");

      if (!existsSync(analysisPath)) {
        console.error(`✗ No analysis.json found in ${fullPath}`);
        continue;
      }

      const data = JSON.parse(readFileSync(analysisPath, "utf-8"));
      const fit = data.fitAnalysis;

      analyses.push({
        dir,
        company: data.parsedJD?.company ?? "Unknown",
        role: data.parsedJD?.role ?? "Unknown",
        score: fit?.overallScore ?? 0,
        matches: fit?.strongMatches?.length ?? 0,
        gaps: fit?.gaps?.length ?? 0,
        advantages: fit?.competitiveAdvantages ?? [],
      });
    }

    if (analyses.length < 2) {
      console.error("Need at least 2 valid analyses to compare.");
      process.exit(1);
    }

    // Sort by score descending
    analyses.sort((a, b) => b.score - a.score);

    // Header
    const colWidth = 30;
    console.log(padEnd("", 18) + analyses.map(a => padEnd(truncate(a.company, colWidth - 2), colWidth)).join(""));
    console.log(padEnd("", 18) + analyses.map(a => padEnd(truncate(a.role, colWidth - 2), colWidth)).join(""));
    console.log("─".repeat(18 + analyses.length * colWidth));

    // Rows
    console.log(padEnd("Fit Score", 18) + analyses.map(a => padEnd(`${a.score}/100`, colWidth)).join(""));
    console.log(padEnd("Strong Matches", 18) + analyses.map(a => padEnd(`${a.matches}`, colWidth)).join(""));
    console.log(padEnd("Gaps", 18) + analyses.map(a => padEnd(`${a.gaps}`, colWidth)).join(""));
    console.log(padEnd("Advantages", 18) + analyses.map(a => padEnd(`${a.advantages.length}`, colWidth)).join(""));

    console.log("─".repeat(18 + analyses.length * colWidth));
    console.log(`\n🏆 Best fit: ${analyses[0].company} — ${analyses[0].role} (${analyses[0].score}/100)`);
  });

// --- costs ---

program
  .command("costs")
  .description("Show token usage and cost across all runs")
  .action(() => {
    const runs = loadAllRuns(OUTPUT_ROOT);

    if (runs.length === 0) {
      console.log("No analysis runs found in output/");
      return;
    }

    console.log("╔══════════════════════════════════════════════════════════════════╗");
    console.log("║                   JobFit Agent — Cost Report                    ║");
    console.log("╚══════════════════════════════════════════════════════════════════╝\n");

    console.log(
      padEnd("Date", 12) +
      padEnd("Company", 22) +
      padEnd("Input", 10) +
      padEnd("Output", 10) +
      padEnd("Total", 10) +
      "Cost"
    );
    console.log("─".repeat(74));

    let totalInput = 0;
    let totalOutput = 0;
    let totalCost = 0;

    for (const run of runs) {
      const input = run.inputTokens ?? 0;
      const output = run.outputTokens ?? 0;
      const cost = run.cost ?? 0;
      totalInput += input;
      totalOutput += output;
      totalCost += cost;

      console.log(
        padEnd(run.date, 12) +
        padEnd(truncate(run.company, 20), 22) +
        padEnd(formatTokens(input), 10) +
        padEnd(formatTokens(output), 10) +
        padEnd(formatTokens(input + output), 10) +
        `$${cost.toFixed(4)}`
      );
    }

    console.log("─".repeat(74));
    console.log(
      padEnd("TOTAL", 34) +
      padEnd(formatTokens(totalInput), 10) +
      padEnd(formatTokens(totalOutput), 10) +
      padEnd(formatTokens(totalInput + totalOutput), 10) +
      `$${totalCost.toFixed(4)}`
    );
    console.log(`\n${runs.length} run${runs.length > 1 ? "s" : ""}`);
  });

// --- Helpers ---

function padEnd(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + " ".repeat(len - str.length);
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

// --- Run ---

program.parse();
