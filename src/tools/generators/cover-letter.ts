import { LLMClient, LLMCallResult } from "../../llm/client.js";
import type { ParsedJD, ParsedResume, FitAnalysis } from "../../llm/schemas.js";
import { z } from "zod";

const CoverLetterSchema = z.object({
  coverLetter: z.string().describe("The full cover letter text, ready to use"),
});

const MOCK_COVER_LETTER = `Dear Hiring Manager,

I'm writing to express my strong interest in the Staff Software Engineer - Platform Infrastructure role at Acme Cloud Inc. With over 7 years of experience building scalable backend systems and cloud-native applications, I'm excited about the opportunity to shape the technical direction of your platform infrastructure team.

Your emphasis on engineering excellence and ownership resonates deeply with my professional values. At TechScale Inc., I led the migration from a monolithic architecture to microservices, a company-wide initiative that reduced deployment time by 70% and required defining service boundaries, reliability patterns, and deployment strategies across multiple teams. This experience directly aligns with your need for someone to lead the design of scalable, fault-tolerant distributed systems.

I'm particularly drawn to three aspects of this role. First, owning the observability stack — at DataFlow Systems, I built the full monitoring infrastructure with Prometheus, Grafana, and PagerDuty, and even authored an open-source Prometheus exporter that's gained 200+ GitHub stars. Second, the platform engineering focus — I built an internal developer platform at TechScale that standardized CI/CD workflows for the engineering organization. Third, mentoring senior engineers — I've led architecture review sessions and mentored engineers through complex technical challenges.

I bring hands-on expertise with much of your tech stack: Kubernetes (CKAD certified), Docker, Terraform, AWS, Kafka, PostgreSQL, and Redis. I'm eager to deepen my systems programming skills in Go to complement my existing TypeScript and Python proficiency.

I'd welcome the chance to discuss how my experience in distributed systems, platform engineering, and technical leadership can contribute to Acme Cloud's infrastructure team.

Best regards,
Kumar Nagarajan`;

export async function generateCoverLetter(
  parsedJD: ParsedJD,
  parsedResume: ParsedResume,
  fitAnalysis: FitAnalysis,
  llm: LLMClient
): Promise<LLMCallResult<string>> {
  console.log("✉️  Generating cover letter...");

  const prompt = `Write a professional cover letter for the following job application.

JOB DETAILS:
- Company: ${parsedJD.company}
- Role: ${parsedJD.role} (${parsedJD.level} level)
- Team: ${parsedJD.team ?? "Not specified"}
- Top requirements: ${parsedJD.requiredSkills.map((s) => s.name).join(", ")}

CANDIDATE BACKGROUND:
- Years of experience: ${parsedResume.yearsOfExperience}
- Current/recent role: ${parsedResume.experiences[0]?.role ?? "N/A"} at ${parsedResume.experiences[0]?.company ?? "N/A"}
- Key skills: ${parsedResume.skills.map((s) => s.name).join(", ")}

FIT ANALYSIS:
- Overall score: ${fitAnalysis.overallScore}/100
- Strong matches: ${fitAnalysis.strongMatches.map((m) => m.skill).join(", ")}
- Key gaps: ${fitAnalysis.gaps.map((g) => g.skill).join(", ")}
- Competitive advantages: ${fitAnalysis.competitiveAdvantages.join("; ")}

REFRAMING SUGGESTIONS TO USE:
${fitAnalysis.reframingSuggestions.map((r) => `- "${r.existingExperience}" → frame as: "${r.reframedAs}"`).join("\n")}

REQUIREMENTS:
1. Under 400 words
2. Address the company's top 3 requirements specifically
3. Use reframing suggestions to position experience favorably
4. Include specific accomplishments with numbers/metrics
5. Show genuine enthusiasm for the company/team, not generic flattery
6. Address cultural fit signals: ${parsedJD.culture.join(", ")}
7. End with a confident but not arrogant closing

Return JSON: { "coverLetter": "the full cover letter text" }`;

  const result = await llm.structured(
    prompt,
    CoverLetterSchema,
    "You are an expert career coach who writes compelling, authentic cover letters. Respond with JSON only.",
    { coverLetter: MOCK_COVER_LETTER }
  );

  const wordCount = result.data.coverLetter.split(/\s+/).length;
  console.log(`  ✓ Cover letter generated (${wordCount} words, ${result.durationMs}ms)`);

  return {
    ...result,
    data: result.data.coverLetter,
  };
}
