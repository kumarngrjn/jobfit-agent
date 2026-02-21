import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import type { PipelineContext } from "../agent/state.js";
import type { TokenUsageSummary } from "../llm/client.js";
import { logger } from "./logger.js";
import { generateFitReport } from "../tools/generators/fit-report.js";

export interface WriteRunOutputsMeta {
  timestamp: string;
  success: boolean;
  totalDurationMs: number;
  jdSource: string;
  resumeSource: string;
  tokenUsage: TokenUsageSummary;
}

export function writeRunOutputs(
  outputDir: string,
  ctx: PipelineContext,
  meta: WriteRunOutputsMeta
): void {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  writeFileSync(
    join(outputDir, "analysis.json"),
    JSON.stringify(
      { parsedJD: ctx.parsedJD, parsedResume: ctx.parsedResume, fitAnalysis: ctx.fitAnalysis },
      null,
      2
    )
  );

  if (ctx.parsedJD && ctx.fitAnalysis) {
    writeFileSync(join(outputDir, "fit-report.md"), generateFitReport(ctx.parsedJD, ctx.fitAnalysis));
  }
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
    join(outputDir, "metadata.json"),
    JSON.stringify(
      {
        timestamp: meta.timestamp,
        success: meta.success,
        totalDurationMs: meta.totalDurationMs,
        jdSource: meta.jdSource,
        resumeSource: meta.resumeSource,
        tokenUsage: meta.tokenUsage,
        stateHistory: ctx.stateHistory,
        validation: ctx.validation,
        errors: ctx.errors,
      },
      null,
      2
    )
  );

  logger.saveTo(join(outputDir, "logs.json"));
}
