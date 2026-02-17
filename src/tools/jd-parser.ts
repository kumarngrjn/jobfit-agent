import { LLMClient, LLMCallResult } from "../llm/client.js";
import { ParsedJD, ParsedJDSchema } from "../llm/schemas.js";
import { buildJDParsingPrompt } from "../llm/prompts.js";
import { mockParsedJD } from "../llm/mock-data.js";

export async function parseJobDescription(
  jdText: string,
  llm: LLMClient
): Promise<LLMCallResult<ParsedJD>> {
  console.log("📋 Parsing job description...");

  if (!jdText.trim()) {
    throw new Error("Job description text is empty");
  }

  const prompt = buildJDParsingPrompt(jdText);

  const result = await llm.structured(
    prompt,
    ParsedJDSchema,
    "You are an expert technical recruiter. Extract structured data from job descriptions. Always respond with valid JSON only — no explanations, no markdown.",
    mockParsedJD
  );

  console.log(
    `  ✓ Parsed JD: ${result.data.company} — ${result.data.role} (${result.data.level})`
  );
  console.log(
    `    ${result.data.requiredSkills.length} required skills, ${result.data.preferredSkills.length} preferred`
  );
  console.log(`    ${result.usage.inputTokens + result.usage.outputTokens} tokens, ${result.durationMs}ms`);

  return result;
}
