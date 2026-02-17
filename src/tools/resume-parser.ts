import { LLMClient, LLMCallResult } from "../llm/client.js";
import { ParsedResume, ParsedResumeSchema } from "../llm/schemas.js";
import { buildResumeParsingPrompt } from "../llm/prompts.js";
import { mockParsedResume } from "../llm/mock-data.js";

export async function parseResume(
  resumeText: string,
  llm: LLMClient
): Promise<LLMCallResult<ParsedResume>> {
  console.log("📄 Parsing resume...");

  if (!resumeText.trim()) {
    throw new Error("Resume text is empty");
  }

  const prompt = buildResumeParsingPrompt(resumeText);

  const result = await llm.structured(
    prompt,
    ParsedResumeSchema,
    "You are an expert resume analyst. Extract structured data from resumes. Always respond with valid JSON only — no explanations, no markdown.",
    mockParsedResume
  );

  console.log(
    `  ✓ Parsed resume: ${result.data.yearsOfExperience} years experience, ${result.data.skills.length} skills`
  );
  console.log(
    `    ${result.data.experiences.length} roles, ${result.data.education.length} degrees`
  );
  console.log(`    ${result.usage.inputTokens + result.usage.outputTokens} tokens, ${result.durationMs}ms`);

  return result;
}
