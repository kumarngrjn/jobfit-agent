import { describe, expect, it } from "vitest";
import { generateFitReport } from "../../src/tools/generators/fit-report.js";
import { mockParsedJD, mockFitAnalysis } from "../../src/llm/mock-data.js";

describe("generateFitReport", () => {
  it("includes all required sections", () => {
    const report = generateFitReport(mockParsedJD, mockFitAnalysis);

    expect(report).toContain(`# Fit Report: ${mockParsedJD.role} @ ${mockParsedJD.company}`);
    expect(report).toContain("## Strong Matches");
    expect(report).toContain("## Partial Matches");
    expect(report).toContain("## Gaps (Ordered by Severity)");
    expect(report).toContain("## Deal Breakers");
    expect(report).toContain("## Overqualified Areas");
    expect(report).toContain("## Reframing Suggestions");
    expect(report).toContain("## Competitive Advantages");
  });

  it("is deterministic for the same input", () => {
    const reportA = generateFitReport(mockParsedJD, mockFitAnalysis);
    const reportB = generateFitReport(mockParsedJD, mockFitAnalysis);

    expect(reportA).toBe(reportB);
  });

  it("orders gaps by severity critical -> moderate -> minor", () => {
    const report = generateFitReport(mockParsedJD, mockFitAnalysis);

    const gapRows = report
      .split("\n")
      .filter((line) => /^\|\s*(critical|moderate|minor)\s*\|/i.test(line));

    expect(gapRows.length).toBeGreaterThan(0);

    const severities = gapRows.map((line) => {
      const match = line.match(/^\|\s*(critical|moderate|minor)\s*\|/i);
      return match?.[1]?.toLowerCase() ?? "";
    });

    const firstModerate = severities.indexOf("moderate");
    const firstMinor = severities.indexOf("minor");

    const criticalBeforeModerate =
      firstModerate === -1 || severities.slice(0, firstModerate).every((s) => s === "critical");
    const moderateBeforeMinor =
      firstMinor === -1 || severities.slice(0, firstMinor).every((s) => s === "critical" || s === "moderate");

    expect(criticalBeforeModerate).toBe(true);
    expect(moderateBeforeMinor).toBe(true);
  });
});
