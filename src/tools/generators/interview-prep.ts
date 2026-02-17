import { LLMClient, LLMCallResult } from "../../llm/client.js";
import type { ParsedJD, ParsedResume, FitAnalysis } from "../../llm/schemas.js";
import { z } from "zod";

const InterviewPrepSchema = z.object({
  technicalQuestions: z.array(
    z.object({
      question: z.string(),
      why: z.string().describe("Why they might ask this"),
      talkingPoints: z.array(z.string()),
    })
  ),
  behavioralQuestions: z.array(
    z.object({
      question: z.string(),
      why: z.string(),
      suggestedStory: z.string().describe("A specific experience from the resume to use"),
    })
  ),
  questionsToAsk: z.array(
    z.object({
      question: z.string(),
      purpose: z.string().describe("What this question reveals"),
    })
  ),
});

const MOCK_INTERVIEW_PREP = {
  technicalQuestions: [
    {
      question: "How would you design a fault-tolerant API gateway that handles 10K+ RPS?",
      why: "Directly tests distributed systems design — their core need for the platform infrastructure role",
      talkingPoints: [
        "Reference your Kafka pipeline handling 50K events/sec for scale context",
        "Discuss load balancing strategies, circuit breakers, and graceful degradation",
        "Mention your experience with Redis caching reducing latency by 40%",
        "Talk about observability — how you'd instrument it with Prometheus/Grafana",
      ],
    },
    {
      question: "Describe your experience with container orchestration. How would you handle a rolling deployment that goes wrong?",
      why: "Tests Kubernetes depth — you're CKAD certified so they'll want to see practical knowledge",
      talkingPoints: [
        "Describe canary deployments and automated rollback strategies",
        "Reference your CI/CD platform work at TechScale with Docker and GitHub Actions",
        "Discuss health checks, readiness probes, and pod disruption budgets",
        "Mention your runbook automation that reduced MTTR by 50%",
      ],
    },
    {
      question: "You don't have Go or Rust experience. How would you ramp up on our primary languages?",
      why: "They'll directly address your biggest gap — be prepared with a concrete plan",
      talkingPoints: [
        "Acknowledge the gap honestly — don't oversell",
        "Highlight that your TypeScript/Node.js systems thinking transfers well to Go",
        "Mention a specific learning plan: Go Tour, building a small service, contributing to an internal project",
        "Point out that your Python and Java background shows you learn languages quickly",
      ],
    },
    {
      question: "How do you approach observability for a distributed system? Walk us through your ideal setup.",
      why: "This is a strong match area — the role owns the observability stack",
      talkingPoints: [
        "Three pillars: metrics (Prometheus), logging (structured/ELK), tracing (Jaeger)",
        "Your open-source Prometheus exporter shows deep metrics expertise",
        "Discuss SLOs, error budgets, and how observability drives reliability decisions",
        "Reference your PagerDuty alerting setup and reduced MTTR at DataFlow",
      ],
    },
  ],
  behavioralQuestions: [
    {
      question: "Tell me about a time you led a complex technical initiative that spanned multiple teams.",
      why: "Tests staff-level scope — cross-team leadership is central to the role",
      suggestedStory: "The monolith-to-microservices migration at TechScale: frame it as a cross-team architecture decision where you defined service boundaries, coordinated with multiple teams, and delivered measurable results (70% faster deployments).",
    },
    {
      question: "Describe a situation where you had to make a difficult technical trade-off. How did you decide?",
      why: "Staff engineers are expected to make and defend architectural decisions",
      suggestedStory: "Choosing between event-driven vs. synchronous architecture for the data pipeline at TechScale. Discuss the trade-offs you evaluated (latency vs. complexity, cost vs. throughput) and how you arrived at Kafka as the solution handling 50K events/sec.",
    },
    {
      question: "How do you approach mentoring engineers who are more junior than you?",
      why: "The role explicitly requires mentoring senior engineers",
      suggestedStory: "Your weekly architecture review sessions and mentoring 3 engineers at TechScale. Give a specific example of how you helped someone grow — perhaps a junior engineer you guided through their first major system design.",
    },
    {
      question: "Tell me about a production incident you handled. What did you learn?",
      why: "The role includes Tier-1 on-call — they want to know you handle pressure well",
      suggestedStory: "Reference your incident response work at DataFlow where you reduced MTTR by 50% through runbook automation. Describe a specific incident, your debugging process, the resolution, and the systemic improvements you made afterward.",
    },
  ],
  questionsToAsk: [
    {
      question: "What does the platform infrastructure team's current architecture look like, and what are the biggest technical challenges you're facing in the next 6-12 months?",
      purpose: "Shows strategic thinking and helps you assess the actual technical problems you'd be solving",
    },
    {
      question: "How does the team balance new platform feature development with reliability and tech debt work?",
      purpose: "Reveals engineering culture and whether they truly value the reliability work they mention in the JD",
    },
    {
      question: "Can you tell me about the last major architectural decision the team made? How was it driven and who was involved?",
      purpose: "Shows you care about decision-making process and helps assess if staff engineers actually have influence",
    },
    {
      question: "What does success look like for this role in the first 90 days?",
      purpose: "Practical question that shows you're already thinking about impact and helps set realistic expectations",
    },
    {
      question: "How does the on-call rotation work? What's the typical incident volume and severity?",
      purpose: "Important for work-life balance assessment and shows you take operational responsibility seriously",
    },
  ],
};

export async function generateInterviewPrep(
  parsedJD: ParsedJD,
  parsedResume: ParsedResume,
  fitAnalysis: FitAnalysis,
  llm: LLMClient
): Promise<LLMCallResult<string>> {
  console.log("🎤 Generating interview prep guide...");

  const prompt = `Create a comprehensive interview preparation guide for this specific job application.

JOB: ${parsedJD.role} at ${parsedJD.company} (${parsedJD.level})
TECH STACK: ${parsedJD.techStack.join(", ")}
KEY RESPONSIBILITIES: ${parsedJD.responsibilities.join("; ")}

CANDIDATE: ${parsedResume.yearsOfExperience} years experience
STRONG MATCHES: ${fitAnalysis.strongMatches.map((m) => m.skill).join(", ")}
GAPS: ${fitAnalysis.gaps.map((g) => `${g.skill} (${g.severity})`).join(", ")}

CANDIDATE'S KEY EXPERIENCES:
${parsedResume.experiences.map((e) => `${e.role} at ${e.company}: ${e.highlights.join("; ")}`).join("\n")}

Generate:
1. 4 technical questions they're likely to ask, with talking points using the candidate's actual experience
2. 4 behavioral questions, each with a specific story from the resume to tell
3. 5 questions the candidate should ask the interviewer

Return JSON with this structure:
{
  "technicalQuestions": [{ "question": "...", "why": "...", "talkingPoints": ["..."] }],
  "behavioralQuestions": [{ "question": "...", "why": "...", "suggestedStory": "..." }],
  "questionsToAsk": [{ "question": "...", "purpose": "..." }]
}`;

  const result = await llm.structured(
    prompt,
    InterviewPrepSchema,
    "You are a senior technical interview coach who prepares staff-level engineers for interviews. Respond with JSON only.",
    MOCK_INTERVIEW_PREP
  );

  // Format as markdown
  const d = result.data;
  let md = `# Interview Prep Guide\n## ${parsedJD.role} at ${parsedJD.company}\n\n`;

  md += `## Technical Questions\n\n`;
  for (const q of d.technicalQuestions) {
    md += `### Q: ${q.question}\n`;
    md += `_Why they ask this: ${q.why}_\n\n`;
    md += `**Talking Points:**\n`;
    for (const tp of q.talkingPoints) {
      md += `- ${tp}\n`;
    }
    md += `\n`;
  }

  md += `## Behavioral Questions\n\n`;
  for (const q of d.behavioralQuestions) {
    md += `### Q: ${q.question}\n`;
    md += `_Why they ask this: ${q.why}_\n\n`;
    md += `**Suggested Story:** ${q.suggestedStory}\n\n`;
  }

  md += `## Questions to Ask the Interviewer\n\n`;
  for (const q of d.questionsToAsk) {
    md += `- **${q.question}**\n  _Purpose: ${q.purpose}_\n\n`;
  }

  console.log(
    `  ✓ Interview prep: ${d.technicalQuestions.length} technical, ${d.behavioralQuestions.length} behavioral, ${d.questionsToAsk.length} to-ask (${result.durationMs}ms)`
  );

  return { ...result, data: md };
}
