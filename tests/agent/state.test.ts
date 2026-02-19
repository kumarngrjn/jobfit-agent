import { describe, it, expect } from "vitest";
import {
  AgentState,
  createPipelineContext,
  transitionTo,
  addTokenUsage,
} from "../../src/agent/state.js";

describe("createPipelineContext", () => {
  it("creates context with correct defaults", () => {
    const ctx = createPipelineContext("jd text", "resume text");

    expect(ctx.jdText).toBe("jd text");
    expect(ctx.resumeText).toBe("resume text");
    expect(ctx.currentState).toBe(AgentState.INTAKE);
    expect(ctx.parsedJD).toBeNull();
    expect(ctx.parsedResume).toBeNull();
    expect(ctx.fitAnalysis).toBeNull();
    expect(ctx.outputs.coverLetter).toBeNull();
    expect(ctx.outputs.tailoredBullets).toBeNull();
    expect(ctx.outputs.interviewPrep).toBeNull();
    expect(ctx.validation).toBeNull();
    expect(ctx.validationAttempts).toBe(0);
    expect(ctx.errors).toEqual([]);
    expect(ctx.tokenUsage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it("initializes stateHistory with INTAKE", () => {
    const ctx = createPipelineContext("jd", "resume");

    expect(ctx.stateHistory).toHaveLength(1);
    expect(ctx.stateHistory[0].state).toBe(AgentState.INTAKE);
    expect(ctx.stateHistory[0].timestamp).toBeGreaterThan(0);
  });
});

describe("transitionTo", () => {
  it("updates currentState", () => {
    const ctx = createPipelineContext("jd", "resume");
    transitionTo(ctx, AgentState.PARSE_JD);

    expect(ctx.currentState).toBe(AgentState.PARSE_JD);
  });

  it("appends to stateHistory", () => {
    const ctx = createPipelineContext("jd", "resume");
    transitionTo(ctx, AgentState.PARSE_JD);
    transitionTo(ctx, AgentState.PARSE_RESUME);

    expect(ctx.stateHistory).toHaveLength(3); // INTAKE + 2 transitions
    expect(ctx.stateHistory[1].state).toBe(AgentState.PARSE_JD);
    expect(ctx.stateHistory[2].state).toBe(AgentState.PARSE_RESUME);
  });

  it("records duration on previous state entry", async () => {
    const ctx = createPipelineContext("jd", "resume");

    transitionTo(ctx, AgentState.PARSE_JD);
    // Small delay so duration > 0
    await new Promise((r) => setTimeout(r, 5));
    transitionTo(ctx, AgentState.PARSE_RESUME);

    // The PARSE_JD entry (index 1) should have a durationMs
    expect(ctx.stateHistory[1].durationMs).toBeDefined();
    expect(ctx.stateHistory[1].durationMs!).toBeGreaterThanOrEqual(0);
  });
});

describe("addTokenUsage", () => {
  it("accumulates token usage", () => {
    const ctx = createPipelineContext("jd", "resume");

    addTokenUsage(ctx, 100, 200);
    addTokenUsage(ctx, 300, 400);

    expect(ctx.tokenUsage.inputTokens).toBe(400);
    expect(ctx.tokenUsage.outputTokens).toBe(600);
  });
});
