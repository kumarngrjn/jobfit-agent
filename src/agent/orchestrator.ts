import { LLMClient, getUsageSummary } from "../llm/client.js";
import { parseJobDescription } from "../tools/jd-parser.js";
import { parseResume } from "../tools/resume-parser.js";
import { analyzeGap } from "../tools/gap-analyzer.js";
import { generateCoverLetter } from "../tools/generators/cover-letter.js";
import { generateResumeBullets } from "../tools/generators/resume-bullets.js";
import { generateInterviewPrep } from "../tools/generators/interview-prep.js";
import { validateOutputs } from "./validator.js";
import {
  AgentState,
  PipelineContext,
  createPipelineContext,
  transitionTo,
  addTokenUsage,
} from "./state.js";

const MAX_VALIDATION_ATTEMPTS = 2;

export interface OrchestratorResult {
  context: PipelineContext;
  success: boolean;
  tokenUsage: ReturnType<typeof getUsageSummary>;
  totalDurationMs: number;
}

/**
 * Orchestrator — drives the agent state machine from INTAKE to DONE.
 *
 * State flow:
 *   INTAKE → PARSE_JD → PARSE_RESUME → ANALYZE_FIT
 *          → GENERATE_OUTPUTS → VALIDATE → DONE
 *
 * If validation fails, loops back to GENERATE_OUTPUTS (up to MAX_VALIDATION_ATTEMPTS).
 */
export async function runOrchestrator(
  jdText: string,
  resumeText: string,
  llm: LLMClient,
  onStateChange?: (state: AgentState, ctx: PipelineContext) => void
): Promise<OrchestratorResult> {
  const ctx = createPipelineContext(jdText, resumeText);
  const notify = (state: AgentState) => onStateChange?.(state, ctx);

  console.log("\n🤖 Orchestrator starting...\n");

  try {
    // --- PARSE_JD ---
    transitionTo(ctx, AgentState.PARSE_JD);
    notify(AgentState.PARSE_JD);

    const jdResult = await parseJobDescription(jdText, llm);
    ctx.parsedJD = jdResult.data;
    addTokenUsage(ctx, jdResult.usage.inputTokens, jdResult.usage.outputTokens);
    console.log();

    // --- PARSE_RESUME ---
    transitionTo(ctx, AgentState.PARSE_RESUME);
    notify(AgentState.PARSE_RESUME);

    const resumeResult = await parseResume(resumeText, llm);
    ctx.parsedResume = resumeResult.data;
    addTokenUsage(ctx, resumeResult.usage.inputTokens, resumeResult.usage.outputTokens);
    console.log();

    // --- ANALYZE_FIT ---
    transitionTo(ctx, AgentState.ANALYZE_FIT);
    notify(AgentState.ANALYZE_FIT);

    const fitResult = await analyzeGap(ctx.parsedJD, ctx.parsedResume, llm);
    ctx.fitAnalysis = fitResult.data;
    addTokenUsage(ctx, fitResult.usage.inputTokens, fitResult.usage.outputTokens);
    console.log();

    // --- GENERATE_OUTPUTS (with validation loop) ---
    let validated = false;

    while (!validated && ctx.validationAttempts < MAX_VALIDATION_ATTEMPTS) {
      transitionTo(ctx, AgentState.GENERATE_OUTPUTS);
      notify(AgentState.GENERATE_OUTPUTS);
      ctx.validationAttempts++;

      console.log(
        ctx.validationAttempts > 1
          ? `\n🔄 Re-generating outputs (attempt ${ctx.validationAttempts}/${MAX_VALIDATION_ATTEMPTS})...\n`
          : ""
      );

      // Run all three generators in parallel
      const [coverLetterResult, bulletsResult, interviewResult] =
        await Promise.all([
          // Only regenerate if it failed validation (or first attempt)
          !ctx.validation || !ctx.validation.coverLetterValid
            ? generateCoverLetter(ctx.parsedJD, ctx.parsedResume, ctx.fitAnalysis, llm)
            : null,
          !ctx.validation || !ctx.validation.bulletsValid
            ? generateResumeBullets(ctx.parsedJD, ctx.parsedResume, ctx.fitAnalysis, llm)
            : null,
          !ctx.validation || !ctx.validation.interviewPrepValid
            ? generateInterviewPrep(ctx.parsedJD, ctx.parsedResume, ctx.fitAnalysis, llm)
            : null,
        ]);

      // Update outputs and track tokens
      if (coverLetterResult) {
        ctx.outputs.coverLetter = coverLetterResult.data;
        addTokenUsage(ctx, coverLetterResult.usage.inputTokens, coverLetterResult.usage.outputTokens);
      }
      if (bulletsResult) {
        ctx.outputs.tailoredBullets = bulletsResult.data;
        addTokenUsage(ctx, bulletsResult.usage.inputTokens, bulletsResult.usage.outputTokens);
      }
      if (interviewResult) {
        ctx.outputs.interviewPrep = interviewResult.data;
        addTokenUsage(ctx, interviewResult.usage.inputTokens, interviewResult.usage.outputTokens);
      }

      // --- VALIDATE ---
      transitionTo(ctx, AgentState.VALIDATE);
      notify(AgentState.VALIDATE);
      console.log("\n🔎 Validating outputs...");

      ctx.validation = validateOutputs(ctx.outputs, ctx.parsedJD);
      validated = ctx.validation.passed;
    }

    if (!validated) {
      console.log(
        `\n⚠ Validation did not fully pass after ${MAX_VALIDATION_ATTEMPTS} attempts. Proceeding with best effort.\n`
      );
    }

    // --- DONE ---
    transitionTo(ctx, AgentState.DONE);
    notify(AgentState.DONE);
  } catch (err: any) {
    console.error(`\n❌ Orchestrator error in state ${ctx.currentState}: ${err.message}`);
    ctx.errors.push(`${ctx.currentState}: ${err.message}`);
    try {
      transitionTo(ctx, AgentState.ERROR);
    } catch {
      // If we can't transition, just set it directly
      ctx.currentState = AgentState.ERROR;
    }
  }

  const totalDurationMs = Date.now() - ctx.startTime;
  const tokenUsage = getUsageSummary();

  console.log(`\n🤖 Orchestrator finished in ${ctx.currentState} (${totalDurationMs}ms)\n`);

  return {
    context: ctx,
    success: ctx.currentState === AgentState.DONE,
    tokenUsage,
    totalDurationMs,
  };
}
