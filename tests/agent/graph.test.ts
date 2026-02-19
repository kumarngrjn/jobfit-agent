import { describe, it, expect, vi } from "vitest";
import { runGraph, createAgentGraph } from "../../src/agent/graph.js";
import type { AgentGraph, NodeHandler } from "../../src/agent/graph.js";
import { AgentState, createPipelineContext } from "../../src/agent/state.js";
import { LLMClient } from "../../src/llm/client.js";

// Suppress console output during tests
vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

function makeMockLLM(): LLMClient {
  process.env.MOCK_LLM = "true";
  return new LLMClient();
}

describe("runGraph", () => {
  it("executes handlers in linear sequence", async () => {
    const executed: AgentState[] = [];

    const handlers: [AgentState, NodeHandler][] = [
      [AgentState.PARSE_JD, async (ctx) => { executed.push(AgentState.PARSE_JD); return AgentState.PARSE_RESUME; }],
      [AgentState.PARSE_RESUME, async (ctx) => { executed.push(AgentState.PARSE_RESUME); return AgentState.DONE; }],
    ];

    const graph: AgentGraph = {
      nodes: new Map(handlers),
      terminalStates: new Set([AgentState.DONE, AgentState.ERROR]),
    };

    const ctx = createPipelineContext("jd", "resume");
    const llm = makeMockLLM();

    await runGraph(graph, ctx, llm, AgentState.PARSE_JD);

    expect(executed).toEqual([AgentState.PARSE_JD, AgentState.PARSE_RESUME]);
    expect(ctx.currentState).toBe(AgentState.DONE);
  });

  it("handles conditional edges (like VALIDATE retry loop)", async () => {
    let attempts = 0;

    const graph: AgentGraph = {
      nodes: new Map<AgentState, NodeHandler>([
        [AgentState.GENERATE_OUTPUTS, async () => {
          attempts++;
          return AgentState.VALIDATE;
        }],
        [AgentState.VALIDATE, async () => {
          // First time: retry. Second time: done.
          return attempts < 2 ? AgentState.GENERATE_OUTPUTS : AgentState.DONE;
        }],
      ]),
      terminalStates: new Set([AgentState.DONE, AgentState.ERROR]),
    };

    const ctx = createPipelineContext("jd", "resume");
    const llm = makeMockLLM();

    await runGraph(graph, ctx, llm, AgentState.GENERATE_OUTPUTS);

    expect(attempts).toBe(2);
    expect(ctx.currentState).toBe(AgentState.DONE);
  });

  it("transitions to ERROR when a handler throws", async () => {
    const graph: AgentGraph = {
      nodes: new Map<AgentState, NodeHandler>([
        [AgentState.PARSE_JD, async () => { throw new Error("LLM failed"); }],
      ]),
      terminalStates: new Set([AgentState.DONE, AgentState.ERROR]),
    };

    const ctx = createPipelineContext("jd", "resume");
    const llm = makeMockLLM();

    await runGraph(graph, ctx, llm, AgentState.PARSE_JD);

    expect(ctx.currentState).toBe(AgentState.ERROR);
    expect(ctx.errors).toContain("PARSE_JD: LLM failed");
  });

  it("throws when no handler is registered for a state", async () => {
    const graph: AgentGraph = {
      nodes: new Map(),
      terminalStates: new Set([AgentState.DONE, AgentState.ERROR]),
    };

    const ctx = createPipelineContext("jd", "resume");
    const llm = makeMockLLM();

    await expect(
      runGraph(graph, ctx, llm, AgentState.PARSE_JD)
    ).rejects.toThrow("No handler registered for state: PARSE_JD");
  });

  it("records state history with timestamps", async () => {
    const graph: AgentGraph = {
      nodes: new Map<AgentState, NodeHandler>([
        [AgentState.PARSE_JD, async () => AgentState.DONE],
      ]),
      terminalStates: new Set([AgentState.DONE, AgentState.ERROR]),
    };

    const ctx = createPipelineContext("jd", "resume");
    const llm = makeMockLLM();

    await runGraph(graph, ctx, llm, AgentState.PARSE_JD);

    // INTAKE (initial) + PARSE_JD + DONE
    expect(ctx.stateHistory.length).toBe(3);
    expect(ctx.stateHistory[1].state).toBe(AgentState.PARSE_JD);
    expect(ctx.stateHistory[2].state).toBe(AgentState.DONE);
    expect(ctx.stateHistory[1].timestamp).toBeGreaterThan(0);
  });

  it("fires onStateChange callback for each state", async () => {
    const states: AgentState[] = [];

    const graph: AgentGraph = {
      nodes: new Map<AgentState, NodeHandler>([
        [AgentState.PARSE_JD, async () => AgentState.PARSE_RESUME],
        [AgentState.PARSE_RESUME, async () => AgentState.DONE],
      ]),
      terminalStates: new Set([AgentState.DONE, AgentState.ERROR]),
    };

    const ctx = createPipelineContext("jd", "resume");
    const llm = makeMockLLM();

    await runGraph(graph, ctx, llm, AgentState.PARSE_JD, (state) => {
      states.push(state);
    });

    expect(states).toEqual([AgentState.PARSE_JD, AgentState.PARSE_RESUME, AgentState.DONE]);
  });
});

describe("createAgentGraph", () => {
  it("registers all 5 expected node handlers", () => {
    const graph = createAgentGraph();

    expect(graph.nodes.has(AgentState.PARSE_JD)).toBe(true);
    expect(graph.nodes.has(AgentState.PARSE_RESUME)).toBe(true);
    expect(graph.nodes.has(AgentState.ANALYZE_FIT)).toBe(true);
    expect(graph.nodes.has(AgentState.GENERATE_OUTPUTS)).toBe(true);
    expect(graph.nodes.has(AgentState.VALIDATE)).toBe(true);
    expect(graph.nodes.size).toBe(5);
  });

  it("defines DONE and ERROR as terminal states", () => {
    const graph = createAgentGraph();

    expect(graph.terminalStates.has(AgentState.DONE)).toBe(true);
    expect(graph.terminalStates.has(AgentState.ERROR)).toBe(true);
    expect(graph.terminalStates.size).toBe(2);
  });
});
