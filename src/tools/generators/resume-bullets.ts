import { LLMClient, LLMCallResult } from "../../llm/client.js";
import type { ParsedJD, ParsedResume, FitAnalysis } from "../../llm/schemas.js";
import { z } from "zod";

const BulletsSchema = z.object({
  bullets: z.array(
    z.object({
      bullet: z.string().describe("The resume bullet point text"),
      targetRequirement: z.string().describe("Which JD requirement this addresses"),
      originalExperience: z.string().describe("Which resume experience this is based on"),
    })
  ),
});

const MOCK_BULLETS = {
  bullets: [
    {
      bullet: "Led company-wide migration from monolithic to microservices architecture, defining service boundaries and deployment strategies that reduced deployment time by 70% and improved system reliability across 12 services",
      targetRequirement: "Lead the design and implementation of scalable, fault-tolerant distributed systems",
      originalExperience: "TechScale Inc. - microservices migration",
    },
    {
      bullet: "Architected and operated a real-time event processing pipeline handling 50K events/sec using Kafka, with end-to-end observability via Prometheus and Grafana dashboards",
      targetRequirement: "Track record of designing and operating systems handling 10K+ RPS",
      originalExperience: "TechScale Inc. - event processing pipeline",
    },
    {
      bullet: "Built and maintained production observability stack (Prometheus metrics, Grafana dashboards, PagerDuty alerting) serving 99.9% uptime SLA; authored open-source Prometheus exporter with 200+ GitHub stars",
      targetRequirement: "Experience with observability: distributed tracing, metrics, logging",
      originalExperience: "DataFlow Systems - observability stack",
    },
    {
      bullet: "Designed and shipped an internal platform engineering initiative that standardized CI/CD workflows using GitHub Actions and Docker, reducing onboarding time for new services from days to hours",
      targetRequirement: "Background in developer experience / platform engineering",
      originalExperience: "TechScale Inc. - developer platform",
    },
    {
      bullet: "Mentored 3 engineers and led weekly architecture review sessions, establishing team standards for API design, testing strategies, and incident response playbooks",
      targetRequirement: "Mentor senior engineers and conduct architecture reviews",
      originalExperience: "TechScale Inc. - mentoring and reviews",
    },
    {
      bullet: "Implemented distributed caching layer with Redis that reduced API response latency by 40% under peak load, directly improving user experience for 50K+ daily active users",
      targetRequirement: "Own critical path services",
      originalExperience: "TechScale Inc. - Redis caching layer",
    },
    {
      bullet: "Spearheaded incident response improvements including runbook automation that reduced MTTR by 50%, establishing on-call best practices adopted across 3 engineering teams",
      targetRequirement: "Contribute to on-call rotation for Tier-1 services",
      originalExperience: "DataFlow Systems - incident response",
    },
  ],
};

export async function generateResumeBullets(
  parsedJD: ParsedJD,
  parsedResume: ParsedResume,
  fitAnalysis: FitAnalysis,
  llm: LLMClient
): Promise<LLMCallResult<string>> {
  console.log("📝 Generating tailored resume bullets...");

  const prompt = `Generate 5-8 tailored resume bullet points for this specific job application.

JOB: ${parsedJD.role} at ${parsedJD.company} (${parsedJD.level})
TOP REQUIREMENTS:
${parsedJD.requiredSkills.map((s) => `- ${s.name}`).join("\n")}

CANDIDATE EXPERIENCES:
${parsedResume.experiences.map((e) => `${e.role} at ${e.company} (${e.duration}):\n${e.highlights.map((h) => `  - ${h}`).join("\n")}`).join("\n\n")}

REFRAMING SUGGESTIONS:
${fitAnalysis.reframingSuggestions.map((r) => `- "${r.existingExperience}" → "${r.reframedAs}" (targets: ${r.targetRequirement})`).join("\n")}

STRONG MATCHES TO HIGHLIGHT:
${fitAnalysis.strongMatches.map((m) => `- ${m.skill}: ${m.evidence}`).join("\n")}

REQUIREMENTS FOR EACH BULLET:
1. Use STAR format (Situation/Task → Action → Result)
2. Include quantified impact (numbers, percentages, scale)
3. Use the JD's language and keywords where natural
4. Each bullet should map to a specific JD requirement
5. 1-2 sentences max per bullet
6. Start with a strong action verb

Return JSON: { "bullets": [{ "bullet": "...", "targetRequirement": "...", "originalExperience": "..." }] }`;

  const result = await llm.structured(
    prompt,
    BulletsSchema,
    "You are an expert resume writer for senior/staff-level software engineers. Respond with JSON only.",
    MOCK_BULLETS
  );

  // Format as markdown
  const formatted = result.data.bullets
    .map(
      (b) =>
        `- **${b.bullet}**\n  _Targets: ${b.targetRequirement} | Based on: ${b.originalExperience}_`
    )
    .join("\n\n");

  console.log(`  ✓ Generated ${result.data.bullets.length} tailored bullets (${result.durationMs}ms)`);

  return {
    ...result,
    data: formatted,
  };
}
