import { LLMClient, LLMCallResult } from "../llm/client.js";
import { ParsedJD, ParsedResume, FitAnalysis, FitAnalysisSchema } from "../llm/schemas.js";
import { buildGapAnalysisPrompt } from "../llm/prompts.js";
import { mockFitAnalysis } from "../llm/mock-data.js";

export async function analyzeGap(
  parsedJD: ParsedJD,
  parsedResume: ParsedResume,
  llm: LLMClient
): Promise<LLMCallResult<FitAnalysis>> {
  console.log("🔍 Analyzing fit...");

  const prompt = buildGapAnalysisPrompt(
    JSON.stringify(parsedJD, null, 2),
    JSON.stringify(parsedResume, null, 2)
  );

  const result = await llm.structured(
    prompt,
    FitAnalysisSchema,
    "You are an expert career advisor and technical recruiter. Analyze job fit with precision. Always respond with valid JSON only — no explanations, no markdown.",
    mockFitAnalysis
  );

  const { data } = result;
  console.log(`  ✓ Fit score: ${data.overallScore}/100`);
  console.log(
    `    ${data.strongMatches.length} strong matches, ${data.gaps.length} gaps, ${data.reframingSuggestions.length} reframe opportunities`
  );
  if (data.dealBreakers.length > 0) {
    console.log(`    ⚠ ${data.dealBreakers.length} potential deal breakers`);
  }
  console.log(`    ${result.usage.inputTokens + result.usage.outputTokens} tokens, ${result.durationMs}ms`);

  return result;
}
