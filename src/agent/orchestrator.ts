import { LLMClient, TokenUsageSummary } from "../llm/client.js";
import {
  AgentState,
  PipelineContext,
  createPipelineContext,
} from "./state.js";
import { createAgentGraph, runGraph } from "./graph.js";
import { logger } from "../utils/logger.js";

export interface OrchestratorResult {
  context: PipelineContext;
  success: boolean;
  tokenUsage: TokenUsageSummary;
  totalDurationMs: number;
}

/**
 * Orchestrator — builds the agent graph and runs it from PARSE_JD to a terminal state.
 *
 * The graph runner loops: get current state → find handler → execute → follow
 * the returned next state → repeat until DONE or ERROR.
 */
export async function runOrchestrator(
  jdText: string,
  resumeText: string,
  llm: LLMClient,
  onStateChange?: (state: AgentState, ctx: PipelineContext) => void
): Promise<OrchestratorResult> {
  const ctx = createPipelineContext(jdText, resumeText);
  const graph = createAgentGraph();

  logger.info("Orchestrator starting", { states: Object.values(AgentState).length });
  console.log("\n🤖 Orchestrator starting...\n");

  await runGraph(graph, ctx, llm, AgentState.PARSE_JD, onStateChange);

  const totalDurationMs = Date.now() - ctx.startTime;
  const tokenUsage = llm.getUsageSummary();

  logger.info("Orchestrator finished", {
    state: ctx.currentState,
    durationMs: totalDurationMs,
    tokenUsage,
    errors: ctx.errors,
  });
  console.log(`\n🤖 Orchestrator finished in ${ctx.currentState} (${totalDurationMs}ms)\n`);

  return {
    context: ctx,
    success: ctx.currentState === AgentState.DONE,
    tokenUsage,
    totalDurationMs,
  };
}
