import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { LLMClient } from "./llm/client.js";
import { runOrchestrator } from "./agent/orchestrator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  const jdPath = join(__dirname, "../tests/fixtures/sample-jd.txt");
  const resumePath = join(__dirname, "../tests/fixtures/sample-resume.txt");

  console.log("╔══════════════════════════════════════╗");
  console.log("║   JobFit Agent — Full Pipeline       ║");
  console.log("╚══════════════════════════════════════╝\n");

  const jdText = readFileSync(jdPath, "utf-8");
  const resumeText = readFileSync(resumePath, "utf-8");
  console.log(`📂 JD: ${jdText.length} chars | Resume: ${resumeText.length} chars\n`);

  const llm = new LLMClient({ maxRetries: 2, maxTokens: 4096 });

  const result = await runOrchestrator(jdText, resumeText, llm);
  const ctx = result.context;

  // Save outputs
  const outputDir = join(__dirname, "../output/full-pipeline-test");
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  if (ctx.outputs.coverLetter) {
    writeFileSync(join(outputDir, "cover-letter.md"), ctx.outputs.coverLetter);
  }
  if (ctx.outputs.tailoredBullets) {
    writeFileSync(join(outputDir, "tailored-bullets.md"), ctx.outputs.tailoredBullets);
  }
  if (ctx.outputs.interviewPrep) {
    writeFileSync(join(outputDir, "interview-prep.md"), ctx.outputs.interviewPrep);
  }
  writeFileSync(
    join(outputDir, "analysis.json"),
    JSON.stringify(
      { parsedJD: ctx.parsedJD, parsedResume: ctx.parsedResume, fitAnalysis: ctx.fitAnalysis },
      null,
      2
    )
  );
  writeFileSync(
    join(outputDir, "metadata.json"),
    JSON.stringify(
      {
        success: result.success,
        totalDurationMs: result.totalDurationMs,
        tokenUsage: result.tokenUsage,
        stateHistory: ctx.stateHistory,
        validation: ctx.validation,
        errors: ctx.errors,
      },
      null,
      2
    )
  );

  // Summary
  console.log("═══════════════════════════════════════");
  console.log(`${result.success ? "✅" : "❌"} Pipeline ${result.success ? "complete" : "failed"}!`);
  console.log(`   📊 Fit Score: ${ctx.fitAnalysis?.overallScore}/100`);
  console.log(`   ✅ Strong: ${ctx.fitAnalysis?.strongMatches.length}  |  ⚠️ Gaps: ${ctx.fitAnalysis?.gaps.length}  |  🎯 Reframe: ${ctx.fitAnalysis?.reframingSuggestions.length}`);
  console.log(`\n   Generated:`);
  console.log(`   - cover-letter.md     ${ctx.outputs.coverLetter ? "✓" : "✗"}`);
  console.log(`   - tailored-bullets.md ${ctx.outputs.tailoredBullets ? "✓" : "✗"}`);
  console.log(`   - interview-prep.md   ${ctx.outputs.interviewPrep ? "✓" : "✗"}`);
  console.log(`\n   📝 Validation: ${ctx.validation?.passed ? "PASSED" : "ISSUES"} (${ctx.validationAttempts} attempt${ctx.validationAttempts > 1 ? "s" : ""})`);
  if (ctx.validation && !ctx.validation.passed) {
    for (const issue of ctx.validation.issues) {
      console.log(`      - ${issue}`);
    }
  }
  console.log(`   ⏱  Total: ${result.totalDurationMs}ms`);
  console.log(`   💰 Tokens: ${result.tokenUsage.totalInputTokens + result.tokenUsage.totalOutputTokens} (~$${result.tokenUsage.estimatedCost.toFixed(4)})`);
  console.log(`\n   Files saved to: ${outputDir}/`);
  console.log("═══════════════════════════════════════");
}

main().catch((err) => {
  console.error("\n❌ Pipeline failed:", err.message);
  process.exit(1);
});
