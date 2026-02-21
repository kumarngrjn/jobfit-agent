import { describe, expect, it } from "vitest";
import { LLMClient } from "../../src/llm/client.js";

describe("LLMClient token usage summary", () => {
  it("tracks usage per instance without cross-bleed", () => {
    process.env.MOCK_LLM = "true";

    const clientA = new LLMClient();
    const clientB = new LLMClient();

    (clientA as any).usageLog.push({ inputTokens: 100, outputTokens: 40 });
    (clientA as any).usageLog.push({ inputTokens: 50, outputTokens: 10 });
    (clientB as any).usageLog.push({ inputTokens: 10, outputTokens: 5 });

    const summaryA = clientA.getUsageSummary();
    const summaryB = clientB.getUsageSummary();

    expect(summaryA.totalInputTokens).toBe(150);
    expect(summaryA.totalOutputTokens).toBe(50);
    expect(summaryA.totalCalls).toBe(2);

    expect(summaryB.totalInputTokens).toBe(10);
    expect(summaryB.totalOutputTokens).toBe(5);
    expect(summaryB.totalCalls).toBe(1);
  });

  it("returns zeroed summary for fresh client", () => {
    process.env.MOCK_LLM = "true";
    const client = new LLMClient();

    expect(client.getUsageSummary()).toEqual({
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCalls: 0,
      estimatedCost: 0,
    });
  });
});
