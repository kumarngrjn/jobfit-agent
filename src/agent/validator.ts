import type { ParsedJD } from "../llm/schemas.js";
import type { GeneratedOutputs, ValidationResult } from "./state.js";

const MAX_COVER_LETTER_WORDS = 450;
const MIN_COVER_LETTER_WORDS = 150;
const MIN_BULLETS = 4;

/**
 * Validates the quality of generated outputs.
 * Returns a ValidationResult with pass/fail and specific issues.
 * The orchestrator can retry generation for any failed section.
 */
export function validateOutputs(
  outputs: GeneratedOutputs,
  parsedJD: ParsedJD
): ValidationResult {
  const issues: string[] = [];

  // --- Cover Letter Validation ---
  let coverLetterValid = true;

  if (!outputs.coverLetter) {
    coverLetterValid = false;
    issues.push("Cover letter is missing");
  } else {
    const wordCount = outputs.coverLetter.split(/\s+/).length;

    if (wordCount > MAX_COVER_LETTER_WORDS) {
      coverLetterValid = false;
      issues.push(
        `Cover letter too long: ${wordCount} words (max ${MAX_COVER_LETTER_WORDS})`
      );
    }

    if (wordCount < MIN_COVER_LETTER_WORDS) {
      coverLetterValid = false;
      issues.push(
        `Cover letter too short: ${wordCount} words (min ${MIN_COVER_LETTER_WORDS})`
      );
    }

    // Check it mentions the company name
    if (
      !outputs.coverLetter
        .toLowerCase()
        .includes(parsedJD.company.toLowerCase().split(" ")[0])
    ) {
      coverLetterValid = false;
      issues.push("Cover letter doesn't mention the company name");
    }

    // Check it references at least one required skill
    const mentionsSkill = parsedJD.requiredSkills.some((s) =>
      outputs.coverLetter!.toLowerCase().includes(s.name.toLowerCase())
    );
    if (!mentionsSkill) {
      coverLetterValid = false;
      issues.push(
        "Cover letter doesn't reference any required skills from the JD"
      );
    }
  }

  // --- Resume Bullets Validation ---
  let bulletsValid = true;

  if (!outputs.tailoredBullets) {
    bulletsValid = false;
    issues.push("Resume bullets are missing");
  } else {
    // Count bullet points (lines starting with -)
    const bulletCount = (outputs.tailoredBullets.match(/^- /gm) || []).length;

    if (bulletCount < MIN_BULLETS) {
      bulletsValid = false;
      issues.push(
        `Too few resume bullets: ${bulletCount} (min ${MIN_BULLETS})`
      );
    }

    // Check bullets use JD keywords
    const jdKeywords = parsedJD.techStack.map((t) => t.toLowerCase());
    const bulletsLower = outputs.tailoredBullets.toLowerCase();
    const keywordHits = jdKeywords.filter((k) => bulletsLower.includes(k));

    if (keywordHits.length < 2) {
      bulletsValid = false;
      issues.push(
        `Resume bullets only reference ${keywordHits.length} tech stack keywords (need at least 2)`
      );
    }
  }

  // --- Interview Prep Validation ---
  let interviewPrepValid = true;

  if (!outputs.interviewPrep) {
    interviewPrepValid = false;
    issues.push("Interview prep is missing");
  } else {
    // Check it has all three sections
    const hasThreeSections =
      outputs.interviewPrep.includes("Technical Questions") &&
      outputs.interviewPrep.includes("Behavioral Questions") &&
      outputs.interviewPrep.includes("Questions to Ask");

    if (!hasThreeSections) {
      interviewPrepValid = false;
      issues.push(
        "Interview prep missing one or more sections (Technical, Behavioral, Questions to Ask)"
      );
    }

    // Check it's not too generic (should mention the company or role)
    if (
      !outputs.interviewPrep
        .toLowerCase()
        .includes(parsedJD.company.toLowerCase().split(" ")[0])
    ) {
      interviewPrepValid = false;
      issues.push(
        "Interview prep appears generic — doesn't mention the company"
      );
    }
  }

  const passed = coverLetterValid && bulletsValid && interviewPrepValid;

  if (passed) {
    console.log("  ✓ All outputs passed validation");
  } else {
    console.log(`  ✗ Validation failed: ${issues.length} issues`);
    for (const issue of issues) {
      console.log(`    - ${issue}`);
    }
  }

  return {
    passed,
    coverLetterValid,
    bulletsValid,
    interviewPrepValid,
    issues,
  };
}
