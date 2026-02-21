import { describe, expect, it, vi } from "vitest";
import { parseJobDescription } from "../../src/tools/jd-parser.js";
import { parseResume } from "../../src/tools/resume-parser.js";
import { LLMClient } from "../../src/llm/client.js";

vi.spyOn(console, "log").mockImplementation(() => {});

describe("parser input validation", () => {
  it("throws for empty JD text", async () => {
    process.env.MOCK_LLM = "true";
    const llm = new LLMClient();

    await expect(parseJobDescription("   ", llm)).rejects.toThrow("Job description text is empty");
  });

  it("throws for empty resume text", async () => {
    process.env.MOCK_LLM = "true";
    const llm = new LLMClient();

    await expect(parseResume("\n\t", llm)).rejects.toThrow("Resume text is empty");
  });
});
