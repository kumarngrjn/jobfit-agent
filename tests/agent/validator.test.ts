import { describe, it, expect, vi } from "vitest";
import { validateOutputs } from "../../src/agent/validator.js";
import { mockParsedJD } from "../../src/llm/mock-data.js";
import type { GeneratedOutputs } from "../../src/agent/state.js";

vi.spyOn(console, "log").mockImplementation(() => {});

// Helper: generate a cover letter with the right content
function makeCoverLetter(opts?: { words?: number; includeCompany?: boolean; includeSkill?: boolean }): string {
  const { words = 200, includeCompany = true, includeSkill = true } = opts ?? {};
  const company = includeCompany ? "Acme Cloud" : "SomeOtherCorp";
  const skill = includeSkill ? "Distributed Systems" : "Basket Weaving";
  const filler = "lorem ipsum dolor sit amet ".repeat(Math.ceil(words / 5));
  return `Dear ${company} team, I am excited about the ${skill} opportunity. ${filler}`.split(/\s+/).slice(0, words).join(" ");
}

function makeBullets(opts?: { count?: number; includeTech?: boolean }): string {
  const { count = 5, includeTech = true } = opts ?? {};
  const tech = includeTech ? ["Kubernetes", "Docker", "Go"] : ["Painting", "Cooking"];
  const bullets = Array.from({ length: count }, (_, i) =>
    `- Built system using ${tech[i % tech.length]} that improved reliability by ${(i + 1) * 10}%`
  );
  return bullets.join("\n");
}

function makeInterviewPrep(opts?: { allSections?: boolean; includeCompany?: boolean }): string {
  const { allSections = true, includeCompany = true } = opts ?? {};
  const company = includeCompany ? "Acme Cloud" : "";
  let content = `# Interview Prep for ${company}\n\n`;
  if (allSections) {
    content += "## Technical Questions\n1. Q1\n2. Q2\n\n";
    content += "## Behavioral Questions\n1. Q1\n2. Q2\n\n";
    content += "## Questions to Ask\n1. Q1\n2. Q2\n";
  } else {
    content += "## Technical Questions\n1. Q1\n";
  }
  return content;
}

function makeValidOutputs(): GeneratedOutputs {
  return {
    coverLetter: makeCoverLetter(),
    tailoredBullets: makeBullets(),
    interviewPrep: makeInterviewPrep(),
  };
}

describe("validateOutputs", () => {
  it("passes with valid outputs", () => {
    const result = validateOutputs(makeValidOutputs(), mockParsedJD);
    expect(result.passed).toBe(true);
    expect(result.coverLetterValid).toBe(true);
    expect(result.bulletsValid).toBe(true);
    expect(result.interviewPrepValid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("fails when all outputs are null", () => {
    const result = validateOutputs(
      { coverLetter: null, tailoredBullets: null, interviewPrep: null },
      mockParsedJD
    );
    expect(result.passed).toBe(false);
    expect(result.coverLetterValid).toBe(false);
    expect(result.bulletsValid).toBe(false);
    expect(result.interviewPrepValid).toBe(false);
    expect(result.issues.length).toBeGreaterThanOrEqual(3);
  });

  // Cover letter tests
  it("fails when cover letter is too short", () => {
    const outputs = makeValidOutputs();
    outputs.coverLetter = makeCoverLetter({ words: 50 });
    const result = validateOutputs(outputs, mockParsedJD);
    expect(result.coverLetterValid).toBe(false);
    expect(result.issues.some(i => i.includes("too short"))).toBe(true);
  });

  it("fails when cover letter is too long", () => {
    const outputs = makeValidOutputs();
    outputs.coverLetter = makeCoverLetter({ words: 500 });
    const result = validateOutputs(outputs, mockParsedJD);
    expect(result.coverLetterValid).toBe(false);
    expect(result.issues.some(i => i.includes("too long"))).toBe(true);
  });

  it("fails when cover letter doesn't mention company", () => {
    const outputs = makeValidOutputs();
    outputs.coverLetter = makeCoverLetter({ includeCompany: false });
    const result = validateOutputs(outputs, mockParsedJD);
    expect(result.coverLetterValid).toBe(false);
    expect(result.issues.some(i => i.includes("company"))).toBe(true);
  });

  it("fails when cover letter doesn't mention any required skill", () => {
    const outputs = makeValidOutputs();
    outputs.coverLetter = makeCoverLetter({ includeSkill: false });
    const result = validateOutputs(outputs, mockParsedJD);
    expect(result.coverLetterValid).toBe(false);
    expect(result.issues.some(i => i.includes("required skills"))).toBe(true);
  });

  // Bullet tests
  it("fails when too few bullets", () => {
    const outputs = makeValidOutputs();
    outputs.tailoredBullets = makeBullets({ count: 2 });
    const result = validateOutputs(outputs, mockParsedJD);
    expect(result.bulletsValid).toBe(false);
    expect(result.issues.some(i => i.includes("Too few"))).toBe(true);
  });

  it("fails when bullets don't reference tech keywords", () => {
    const outputs = makeValidOutputs();
    outputs.tailoredBullets = makeBullets({ includeTech: false });
    const result = validateOutputs(outputs, mockParsedJD);
    expect(result.bulletsValid).toBe(false);
    expect(result.issues.some(i => i.includes("tech stack keywords"))).toBe(true);
  });

  // Interview prep tests
  it("fails when interview prep missing sections", () => {
    const outputs = makeValidOutputs();
    outputs.interviewPrep = makeInterviewPrep({ allSections: false });
    const result = validateOutputs(outputs, mockParsedJD);
    expect(result.interviewPrepValid).toBe(false);
    expect(result.issues.some(i => i.includes("missing one or more sections"))).toBe(true);
  });

  it("fails when interview prep doesn't mention company", () => {
    const outputs = makeValidOutputs();
    outputs.interviewPrep = makeInterviewPrep({ includeCompany: false });
    const result = validateOutputs(outputs, mockParsedJD);
    expect(result.interviewPrepValid).toBe(false);
    expect(result.issues.some(i => i.includes("generic"))).toBe(true);
  });

  it("only marks the failing section as invalid", () => {
    const outputs = makeValidOutputs();
    outputs.coverLetter = makeCoverLetter({ words: 50 }); // too short
    const result = validateOutputs(outputs, mockParsedJD);
    expect(result.coverLetterValid).toBe(false);
    expect(result.bulletsValid).toBe(true);
    expect(result.interviewPrepValid).toBe(true);
    expect(result.passed).toBe(false);
  });
});
