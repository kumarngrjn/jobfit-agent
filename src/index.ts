import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { LLMClient, getUsageSummary } from "./llm/client.js";
import { parseJobDescription } from "./tools/jd-parser.js";
import { parseResume } from "./tools/resume-parser.js";
import { analyzeGap } from "./tools/gap-analyzer.js";

// --- Main Pipeline ---

async function main() {
  const args = process.argv.slice(2);

  // Default to test fixtures if no args provided
  const jdPath = args[0] ?? join(import.meta.dirname ?? ".", "../tests/fixtures/sample-jd.txt");
  const resumePath = args[1] ?? join(import.meta.dirname ?? ".", "../tests/fixtures/sample-resume.txt");

  console.log("╔══════════════════════════════════════╗");
  console.log("║       JobFit Agent — Phase 1         ║");
  console.log("╚══════════════════════════════════════╝\n");

  // 1. Load inputs
  console.log("📂 Loading inputs...");
  let jdText: string;
  let resumeText: string;

  try {
    jdText = readFileSync(jdPath, "utf-8");
    console.log(`  ✓ JD loaded: ${jdPath} (${jdText.length} chars)`);
  } catch {
    console.error(`  ✗ Could not read JD file: ${jdPath}`);
    process.exit(1);
  }

  try {
    resumeText = readFileSync(resumePath, "utf-8");
    console.log(`  ✓ Resume loaded: ${resumePath} (${resumeText.length} chars)\n`);
  } catch {
    console.error(`  ✗ Could not read resume file: ${resumePath}`);
    process.exit(1);
  }

  // 2. Initialize LLM client
  const llm = new LLMClient({
    model: "claude-sonnet-4-5-20250929",
    maxRetries: 2,
    maxTokens: 4096,
  });

  // 3. Parse JD
  const jdResult = await parseJobDescription(jdText, llm);
  console.log();

  // 4. Parse Resume
  const resumeResult = await parseResume(resumeText, llm);
  console.log();

  // 5. Analyze Fit
  const fitResult = await analyzeGap(jdResult.data, resumeResult.data, llm);
  console.log();

  // 6. Save outputs
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const company = jdResult.data.company.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const role = jdResult.data.role.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const outputDir = join(import.meta.dirname ?? ".", `../output/${dateStr}_${company}_${role}`);

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Save analysis JSON
  const analysisOutput = {
    parsedJD: jdResult.data,
    parsedResume: resumeResult.data,
    fitAnalysis: fitResult.data,
  };
  writeFileSync(
    join(outputDir, "analysis.json"),
    JSON.stringify(analysisOutput, null, 2)
  );

  // Save human-readable fit report
  const fitReport = generateFitReport(fitResult.data);
  writeFileSync(join(outputDir, "fit-report.md"), fitReport);

  // Save metadata
  const usage = getUsageSummary();
  const metadata = {
    timestamp: now.toISOString(),
    model: jdResult.model,
    jdSource: jdPath,
    resumeSource: resumePath,
    tokenUsage: usage,
    stepDurations: {
      jdParsingMs: jdResult.durationMs,
      resumeParsingMs: resumeResult.durationMs,
      gapAnalysisMs: fitResult.durationMs,
    },
  };
  writeFileSync(
    join(outputDir, "metadata.json"),
    JSON.stringify(metadata, null, 2)
  );

  // Summary
  console.log("═══════════════════════════════════════");
  console.log(`✅ Analysis complete! Files saved to:\n   ${outputDir}/\n`);
  console.log(`   📊 Fit Score: ${fitResult.data.overallScore}/100`);
  console.log(
    `   ✅ Strong matches: ${fitResult.data.strongMatches.length}  |  ⚠️ Gaps: ${fitResult.data.gaps.length}  |  🎯 Reframe: ${fitResult.data.reframingSuggestions.length}`
  );
  console.log(`\n   Generated:`);
  console.log(`   - analysis.json      (Full structured data)`);
  console.log(`   - fit-report.md      (Human-readable report)`);
  console.log(`   - metadata.json      (Run metadata & costs)`);
  console.log(`\n   💰 Token usage: ${usage.totalInputTokens + usage.totalOutputTokens} total (~$${usage.estimatedCost.toFixed(4)})`);
  console.log("═══════════════════════════════════════");
}

// --- Report Generator ---

function generateFitReport(fit: any): string {
  let md = `# Job Fit Analysis Report\n\n`;
  md += `## Overall Score: ${fit.overallScore}/100\n\n`;

  // Strong matches
  if (fit.strongMatches.length > 0) {
    md += `## Strong Matches\n\n`;
    for (const m of fit.strongMatches) {
      md += `**${m.skill}** (${m.strength})\n${m.evidence}\n\n`;
    }
  }

  // Partial matches
  if (fit.partialMatches.length > 0) {
    md += `## Partial / Transferable Matches\n\n`;
    for (const m of fit.partialMatches) {
      md += `**${m.skill}** (${m.strength})\n${m.evidence}\n\n`;
    }
  }

  // Gaps
  if (fit.gaps.length > 0) {
    md += `## Gaps\n\n`;
    for (const g of fit.gaps) {
      md += `**${g.skill}** — Severity: ${g.severity}\n${g.suggestion}\n\n`;
    }
  }

  // Reframing suggestions
  if (fit.reframingSuggestions.length > 0) {
    md += `## Reframing Suggestions\n\n`;
    for (const r of fit.reframingSuggestions) {
      md += `**${r.existingExperience}** → reframe as: *${r.reframedAs}*\nTargets: ${r.targetRequirement}\n\n`;
    }
  }

  // Deal breakers
  if (fit.dealBreakers.length > 0) {
    md += `## Potential Deal Breakers\n\n`;
    for (const d of fit.dealBreakers) {
      md += `- ${d}\n`;
    }
    md += `\n`;
  }

  // Competitive advantages
  if (fit.competitiveAdvantages.length > 0) {
    md += `## Competitive Advantages\n\n`;
    for (const a of fit.competitiveAdvantages) {
      md += `- ${a}\n`;
    }
    md += `\n`;
  }

  // Overqualified
  if (fit.overqualified.length > 0) {
    md += `## Areas of Overqualification\n\n`;
    for (const o of fit.overqualified) {
      md += `- ${o}\n`;
    }
    md += `\n`;
  }

  return md;
}

// --- Run ---

main().catch((err) => {
  console.error("\n❌ Pipeline failed:", err.message);
  process.exit(1);
});
