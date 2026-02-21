import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { LLMClient } from "../../src/llm/client.js";

vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

function makeResponse(text: string) {
  return {
    usage: { input_tokens: 10, output_tokens: 5 },
    content: [{ type: "text", text }],
  } as any;
}

describe("LLMClient structured retry behavior", () => {
  it("retries and succeeds after malformed output", async () => {
    process.env.MOCK_LLM = "false";
    process.env.ANTHROPIC_API_KEY = "test-key";

    const llm = new LLMClient({ maxRetries: 2, baseDelayMs: 0 });
    const createMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse("{not-json"))
      .mockResolvedValueOnce(makeResponse('{"foo":"ok"}'));

    (llm as any).client = { messages: { create: createMock } };

    const schema = z.object({ foo: z.string() });
    const result = await llm.structured("prompt", schema);

    expect(result.data.foo).toBe("ok");
    expect(createMock).toHaveBeenCalledTimes(2);
    expect(llm.getUsageSummary().totalCalls).toBe(2);
  });

  it("fails after repeated schema validation errors", async () => {
    process.env.MOCK_LLM = "false";
    process.env.ANTHROPIC_API_KEY = "test-key";

    const llm = new LLMClient({ maxRetries: 3, baseDelayMs: 0 });
    const createMock = vi.fn().mockResolvedValue(makeResponse('{"bar":"nope"}'));

    (llm as any).client = { messages: { create: createMock } };

    const schema = z.object({ foo: z.string() });

    await expect(llm.structured("prompt", schema)).rejects.toThrow("Schema validation failed after retries");
    expect(createMock).toHaveBeenCalledTimes(3);
  });
});
