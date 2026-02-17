import { z } from "zod";

// --- Base Types ---

export const SkillSchema = z.object({
  name: z.string().describe("Skill name, e.g. 'TypeScript', 'System Design'"),
  category: z
    .enum([
      "language",
      "framework",
      "tool",
      "platform",
      "methodology",
      "soft-skill",
      "domain",
      "other",
    ])
    .describe("Category of the skill"),
  priority: z
    .enum(["required", "preferred", "nice-to-have"])
    .describe("How important this skill is for the role"),
});

export type Skill = z.infer<typeof SkillSchema>;

// --- Parsed Job Description ---

export const ParsedJDSchema = z.object({
  company: z.string().describe("Company name"),
  role: z.string().describe("Job title"),
  level: z
    .string()
    .describe("Seniority level, e.g. 'Staff', 'Senior', 'Principal'"),
  team: z
    .string()
    .optional()
    .describe("Team or department if mentioned"),
  requiredSkills: z
    .array(SkillSchema)
    .describe("Skills explicitly listed as required"),
  preferredSkills: z
    .array(SkillSchema)
    .describe("Skills listed as preferred or nice-to-have"),
  responsibilities: z
    .array(z.string())
    .describe("Key responsibilities of the role"),
  techStack: z
    .array(z.string())
    .describe("Technologies and tools mentioned"),
  culture: z
    .array(z.string())
    .describe("Cultural values, work style signals"),
  redFlags: z
    .array(z.string())
    .describe("Unrealistic expectations or concerning signals"),
  salaryRange: z
    .string()
    .optional()
    .describe("Salary range if mentioned"),
});

export type ParsedJD = z.infer<typeof ParsedJDSchema>;

// --- Parsed Resume ---

export const ExperienceSchema = z.object({
  company: z.string().describe("Company name"),
  role: z.string().describe("Job title held"),
  duration: z.string().describe("How long in this role, e.g. '2 years'"),
  highlights: z
    .array(z.string())
    .describe("Key accomplishments and responsibilities"),
  techUsed: z
    .array(z.string())
    .describe("Technologies used in this role"),
});

export type Experience = z.infer<typeof ExperienceSchema>;

export const EducationSchema = z.object({
  institution: z.string().describe("School or university name"),
  degree: z.string().describe("Degree earned"),
  field: z.string().describe("Field of study"),
  year: z.string().optional().describe("Graduation year"),
});

export type Education = z.infer<typeof EducationSchema>;

export const ParsedResumeSchema = z.object({
  summary: z.string().describe("Professional summary or objective"),
  skills: z.array(SkillSchema).describe("All skills listed on the resume"),
  experiences: z
    .array(ExperienceSchema)
    .describe("Work experience entries, most recent first"),
  education: z.array(EducationSchema).describe("Education entries"),
  certifications: z
    .array(z.string())
    .describe("Professional certifications"),
  yearsOfExperience: z
    .number()
    .describe("Total years of professional experience"),
});

export type ParsedResume = z.infer<typeof ParsedResumeSchema>;

// --- Fit Analysis ---

export const MatchSchema = z.object({
  skill: z.string().describe("The skill or experience area"),
  evidence: z
    .string()
    .describe("Specific evidence from the resume that supports this match"),
  strength: z
    .enum(["strong", "moderate", "weak"])
    .describe("How strong the match is"),
});

export type Match = z.infer<typeof MatchSchema>;

export const GapSchema = z.object({
  skill: z.string().describe("The missing skill or experience"),
  severity: z
    .enum(["critical", "moderate", "minor"])
    .describe("How important this gap is"),
  suggestion: z
    .string()
    .describe("How to address or mitigate this gap"),
});

export type Gap = z.infer<typeof GapSchema>;

export const ReframeSchema = z.object({
  existingExperience: z
    .string()
    .describe("What you already have"),
  reframedAs: z
    .string()
    .describe("How to position it for this role"),
  targetRequirement: z
    .string()
    .describe("Which JD requirement this addresses"),
});

export type Reframe = z.infer<typeof ReframeSchema>;

export const FitAnalysisSchema = z.object({
  overallScore: z
    .number()
    .min(0)
    .max(100)
    .describe("Overall fit score from 0 to 100"),
  strongMatches: z
    .array(MatchSchema)
    .describe("Skills and experience that directly align with the JD"),
  partialMatches: z
    .array(MatchSchema)
    .describe("Transferable skills that need reframing"),
  gaps: z
    .array(GapSchema)
    .describe("Missing skills with severity and mitigation suggestions"),
  overqualified: z
    .array(z.string())
    .describe("Areas where candidate exceeds requirements"),
  reframingSuggestions: z
    .array(ReframeSchema)
    .describe("How to position existing experience for this role"),
  dealBreakers: z
    .array(z.string())
    .describe("Critical gaps that may disqualify the candidate"),
  competitiveAdvantages: z
    .array(z.string())
    .describe("Unique strengths that set the candidate apart"),
});

export type FitAnalysis = z.infer<typeof FitAnalysisSchema>;
