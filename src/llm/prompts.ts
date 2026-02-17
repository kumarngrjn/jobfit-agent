// --- Prompt Templates ---
// Each function returns the full user prompt for the LLM.
// The system prompt is set in the LLM client to enforce JSON output.

export function buildJDParsingPrompt(jdText: string): string {
  return `Analyze the following job description and extract structured data.

Return a JSON object with EXACTLY these fields:
- company (string): The company name
- role (string): The job title
- level (string): Seniority level (e.g. "Staff", "Senior", "Principal", "Mid-level")
- team (string, optional): Team or department if mentioned
- requiredSkills (array): Skills explicitly listed as required. Each item: { name: string, category: "language"|"framework"|"tool"|"platform"|"methodology"|"soft-skill"|"domain"|"other", priority: "required" }
- preferredSkills (array): Skills listed as preferred/nice-to-have. Same shape but priority: "preferred" or "nice-to-have"
- responsibilities (array of strings): Key responsibilities
- techStack (array of strings): Technologies and tools mentioned
- culture (array of strings): Cultural values, work style signals (e.g. "remote-first", "fast-paced", "collaborative")
- redFlags (array of strings): Any unrealistic expectations, concerning signals, or potential issues
- salaryRange (string, optional): Salary range if mentioned

Be thorough but precise. Only include information that is actually stated or strongly implied in the JD.

JOB DESCRIPTION:
${jdText}`;
}

export function buildResumeParsingPrompt(resumeText: string): string {
  return `Analyze the following resume and extract structured data.

Return a JSON object with EXACTLY these fields:
- summary (string): Professional summary or objective. If not explicitly stated, write a brief one based on the resume content.
- skills (array): All skills mentioned. Each item: { name: string, category: "language"|"framework"|"tool"|"platform"|"methodology"|"soft-skill"|"domain"|"other", priority: "required" }
  Note: Set priority to "required" for all resume skills (they all represent the candidate's actual skills).
- experiences (array): Work experience entries, most recent first. Each item: { company: string, role: string, duration: string, highlights: string[], techUsed: string[] }
- education (array): Education entries. Each item: { institution: string, degree: string, field: string, year: string (optional) }
- certifications (array of strings): Professional certifications
- yearsOfExperience (number): Total years of professional experience (estimate from dates if needed)

Be thorough — capture all skills, technologies, and accomplishments mentioned.

RESUME:
${resumeText}`;
}

export function buildGapAnalysisPrompt(
  jdJson: string,
  resumeJson: string
): string {
  return `You are an expert career advisor and technical recruiter. Analyze the fit between this job description and resume.

PARSED JOB DESCRIPTION:
${jdJson}

PARSED RESUME:
${resumeJson}

Return a JSON object with EXACTLY these fields:
- overallScore (number 0-100): Overall fit score. 90+ = excellent match, 70-89 = good match, 50-69 = moderate, below 50 = weak.
- strongMatches (array): Skills/experience that directly align. Each: { skill: string, evidence: string, strength: "strong"|"moderate"|"weak" }
- partialMatches (array): Transferable skills that could be reframed. Same shape as above.
- gaps (array): Missing skills or experience. Each: { skill: string, severity: "critical"|"moderate"|"minor", suggestion: string }
- overqualified (array of strings): Areas where the candidate exceeds the requirements
- reframingSuggestions (array): How to position existing experience. Each: { existingExperience: string, reframedAs: string, targetRequirement: string }
- dealBreakers (array of strings): Critical gaps that may disqualify the candidate. Be honest but fair.
- competitiveAdvantages (array of strings): Unique strengths that set the candidate apart

SCORING GUIDELINES:
- Weight "required" skills more heavily than "preferred"
- Give credit for adjacent/transferable skills
- Consider years of experience and seniority alignment
- Factor in cultural fit signals
- Be constructive — focus on actionable reframing, not just listing gaps

Be specific with evidence. Reference actual items from the resume, not generic statements.`;
}
