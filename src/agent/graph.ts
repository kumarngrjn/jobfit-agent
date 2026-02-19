import { LLMClient } from "../llm/client.js";
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
  transitionTo,
  addTokenUsage,
} from "./state.js";
import { logger } from "../utils/logger.js";

// --- Types ---

export type NodeHandler = (
  ctx: PipelineContext,
  llm: LLMClient
) => Promise<AgentState>;

export interface AgentGraph {
  nodes: Map<AgentState, NodeHandler>;
  terminalStates: Set<AgentState>;
}

// --- Node Handlers ---

const MAX_VALIDATION_ATTEMPTS = 2;

async function handleParseJD(ctx: PipelineContext, llm: LLMClient): Promise<AgentState> {
  const result = await parseJobDescription(ctx.jdText, llm);
  ctx.parsedJD = result.data;
  addTokenUsage(ctx, result.usage.inputTokens, result.usage.outputTokens);
  return AgentState.PARSE_RESUME;
}

async function handleParseResume(ctx: PipelineContext, llm: LLMClient): Promise<AgentState> {
  const result = await parseResume(ctx.resumeText, llm);
  ctx.parsedResume = result.data;
  addTokenUsage(ctx, result.usage.inputTokens, result.usage.outputTokens);
  return AgentState.ANALYZE_FIT;
}

async function handleAnalyzeFit(ctx: PipelineContext, llm: LLMClient): Promise<AgentState> {
  const result = await analyzeGap(ctx.parsedJD!, ctx.parsedResume!, llm);
  ctx.fitAnalysis = result.data;
  addTokenUsage(ctx, result.usage.inputTokens, result.usage.outputTokens);
  return AgentState.GENERATE_OUTPUTS;
}

async function handleGenerateOutputs(ctx: PipelineContext, llm: LLMClient): Promise<AgentState> {
  ctx.validationAttempts++;

  if (ctx.validationAttempts > 1) {
    console.log(
      `\n🔄 Re-generating outputs (attempt ${ctx.validationAttempts}/${MAX_VALIDATION_ATTEMPTS})...\n`
    );
  }

  // Run all three generators in parallel — only regenerate outputs that failed validation
  const [coverLetterResult, bulletsResult, interviewResult] = await Promise.all([
    !ctx.validation || !ctx.validation.coverLetterValid
      ? generateCoverLetter(ctx.parsedJD!, ctx.parsedResume!, ctx.fitAnalysis!, llm)
      : null,
    !ctx.validation || !ctx.validation.bulletsValid
      ? generateResumeBullets(ctx.parsedJD!, ctx.parsedResume!, ctx.fitAnalysis!, llm)
      : null,
    !ctx.validation || !ctx.validation.interviewPrepValid
      ? generateInterviewPrep(ctx.parsedJD!, ctx.parsedResume!, ctx.fitAnalysis!, llm)
      : null,
  ]);

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

  return AgentState.VALIDATE;
}

async function handleValidate(ctx: PipelineContext, _llm: LLMClient): Promise<AgentState> {
  console.log("\n🔎 Validating outputs...");
  ctx.validation = validateOutputs(ctx.outputs, ctx.parsedJD!);

  if (ctx.validation.passed) {
    return AgentState.DONE;
  }

  // Retry if under the attempt limit
  if (ctx.validationAttempts < MAX_VALIDATION_ATTEMPTS) {
    return AgentState.GENERATE_OUTPUTS;
  }

  // Max attempts reached — proceed with best effort
  console.log(
    `\n⚠ Validation did not fully pass after ${MAX_VALIDATION_ATTEMPTS} attempts. Proceeding with best effort.\n`
  );
  return AgentState.DONE;
}

// --- Graph Definition ---

export function createAgentGraph(): AgentGraph {
  const nodes = new Map<AgentState, NodeHandler>();

  nodes.set(AgentState.PARSE_JD, handleParseJD);
  nodes.set(AgentState.PARSE_RESUME, handleParseResume);
  nodes.set(AgentState.ANALYZE_FIT, handleAnalyzeFit);
  nodes.set(AgentState.GENERATE_OUTPUTS, handleGenerateOutputs);
  nodes.set(AgentState.VALIDATE, handleValidate);

  return {
    nodes,
    terminalStates: new Set([AgentState.DONE, AgentState.ERROR]),
  };
}

// --- Graph Runner ---

export async function runGraph(
  graph: AgentGraph,
  ctx: PipelineContext,
  llm: LLMClient,
  startState: AgentState,
  onStateChange?: (state: AgentState, ctx: PipelineContext) => void,
): Promise<void> {
  let currentState = startState;

  while (!graph.terminalStates.has(currentState)) {
    const handler = graph.nodes.get(currentState);
    if (!handler) {
      throw new Error(`No handler registered for state: ${currentState}`);
    }

    transitionTo(ctx, currentState);
    onStateChange?.(currentState, ctx);

    try {
      logger.debug(`Executing handler for ${currentState}`);
      currentState = await handler(ctx, llm);
      logger.debug(`Handler returned next state: ${currentState}`);
    } catch (err: any) {
      logger.error(`Error in state ${currentState}`, { error: err.message });
      console.error(`\n❌ Error in state ${currentState}: ${err.message}`);
      ctx.errors.push(`${currentState}: ${err.message}`);
      currentState = AgentState.ERROR;
    }
  }

  // Transition to the terminal state
  transitionTo(ctx, currentState);
  onStateChange?.(currentState, ctx);
}
