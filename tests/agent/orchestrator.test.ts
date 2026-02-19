import { describe, it, expect, vi, beforeAll } from "vitest";
import { runOrchestrator } from "../../src/agent/orchestrator.js";
import { AgentState } from "../../src/agent/state.js";
import { LLMClient } from "../../src/llm/client.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Suppress console output
vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

const jdText = readFileSync(join(__dirname, "../fixtures/sample-jd.txt"), "utf-8");
const resumeText = readFileSync(join(__dirname, "../fixtures/sample-resume.txt"), "utf-8");

describe("runOrchestrator (mock integration)", () => {
  let result: Awaited<ReturnType<typeof runOrchestrator>>;

  beforeAll(async () => {
    process.env.MOCK_LLM = "true";
    const llm = new LLMClient();
    result = await runOrchestrator(jdText, resumeText, llm);
  });

  it("completes successfully", () => {
    expect(result.success).toBe(true);
  });

  it("ends in DONE state", () => {
    expect(result.context.currentState).toBe(AgentState.DONE);
  });

  it("produces a parsed JD", () => {
    const jd = result.context.parsedJD;
    expect(jd).not.toBeNull();
    expect(jd!.company).toBeTruthy();
    expect(jd!.role).toBeTruthy();
    expect(jd!.requiredSkills.length).toBeGreaterThan(0);
  });

  it("produces a parsed resume", () => {
    const resume = result.context.parsedResume;
    expect(resume).not.toBeNull();
    expect(resume!.skills.length).toBeGreaterThan(0);
    expect(resume!.yearsOfExperience).toBeGreaterThan(0);
  });

  it("produces a fit analysis with score", () => {
    const fit = result.context.fitAnalysis;
    expect(fit).not.toBeNull();
    expect(fit!.overallScore).toBeGreaterThanOrEqual(0);
    expect(fit!.overallScore).toBeLessThanOrEqual(100);
    expect(fit!.strongMatches.length).toBeGreaterThan(0);
  });

  it("generates all 3 outputs", () => {
    expect(result.context.outputs.coverLetter).toBeTruthy();
    expect(result.context.outputs.tailoredBullets).toBeTruthy();
    expect(result.context.outputs.interviewPrep).toBeTruthy();
  });

  it("ran validation at least once", () => {
    expect(result.context.validationAttempts).toBeGreaterThanOrEqual(1);
  });

  it("has state history covering the full pipeline", () => {
    const states = result.context.stateHistory.map(s => s.state);
    expect(states).toContain(AgentState.INTAKE);
    expect(states).toContain(AgentState.PARSE_JD);
    expect(states).toContain(AgentState.PARSE_RESUME);
    expect(states).toContain(AgentState.ANALYZE_FIT);
    expect(states).toContain(AgentState.GENERATE_OUTPUTS);
    expect(states).toContain(AgentState.VALIDATE);
    expect(states).toContain(AgentState.DONE);
  });

  it("reports totalDurationMs", () => {
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
  });
});
