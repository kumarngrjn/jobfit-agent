import type { FitAnalysis, ParsedJD } from "../../llm/schemas.js";

const GAP_SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  moderate: 1,
  minor: 2,
};

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
}

export function generateFitReport(parsedJD: ParsedJD, fitAnalysis: FitAnalysis): string {
  const sortedGaps = [...fitAnalysis.gaps].sort(
    (a, b) =>
      (GAP_SEVERITY_ORDER[a.severity] ?? Number.MAX_SAFE_INTEGER) -
      (GAP_SEVERITY_ORDER[b.severity] ?? Number.MAX_SAFE_INTEGER)
  );

  const lines: string[] = [];

  lines.push(`# Fit Report: ${parsedJD.role} @ ${parsedJD.company}`);
  lines.push("");
  lines.push(`- **Overall Score:** ${fitAnalysis.overallScore}/100`);
  lines.push(`- **Target Level:** ${parsedJD.level}`);
  lines.push("");

  lines.push("## Strong Matches");
  lines.push("");
  if (fitAnalysis.strongMatches.length === 0) {
    lines.push("None identified.");
  } else {
    lines.push("| Skill | Evidence | Strength |");
    lines.push("|---|---|---|");
    for (const match of fitAnalysis.strongMatches) {
      lines.push(
        `| ${escapeCell(match.skill)} | ${escapeCell(match.evidence)} | ${escapeCell(match.strength)} |`
      );
    }
  }
  lines.push("");

  lines.push("## Partial Matches");
  lines.push("");
  if (fitAnalysis.partialMatches.length === 0) {
    lines.push("None identified.");
  } else {
    lines.push("| Skill | Evidence | Strength |");
    lines.push("|---|---|---|");
    for (const match of fitAnalysis.partialMatches) {
      lines.push(
        `| ${escapeCell(match.skill)} | ${escapeCell(match.evidence)} | ${escapeCell(match.strength)} |`
      );
    }
  }
  lines.push("");

  lines.push("## Gaps (Ordered by Severity)");
  lines.push("");
  if (sortedGaps.length === 0) {
    lines.push("None identified.");
  } else {
    lines.push("| Severity | Skill | Recommendation |");
    lines.push("|---|---|---|");
    for (const gap of sortedGaps) {
      lines.push(
        `| ${escapeCell(gap.severity)} | ${escapeCell(gap.skill)} | ${escapeCell(gap.suggestion)} |`
      );
    }
  }
  lines.push("");

  if (fitAnalysis.dealBreakers.length > 0) {
    lines.push("## Deal Breakers");
    lines.push("");
    for (const dealBreaker of fitAnalysis.dealBreakers) {
      lines.push(`- ${dealBreaker}`);
    }
    lines.push("");
  }

  if (fitAnalysis.overqualified.length > 0) {
    lines.push("## Overqualified Areas");
    lines.push("");
    for (const area of fitAnalysis.overqualified) {
      lines.push(`- ${area}`);
    }
    lines.push("");
  }

  lines.push("## Reframing Suggestions");
  lines.push("");
  if (fitAnalysis.reframingSuggestions.length === 0) {
    lines.push("None identified.");
  } else {
    for (const suggestion of fitAnalysis.reframingSuggestions) {
      lines.push(`- **Current:** ${suggestion.existingExperience}`);
      lines.push(`  - **Reframe As:** ${suggestion.reframedAs}`);
      lines.push(`  - **Targets:** ${suggestion.targetRequirement}`);
    }
  }
  lines.push("");

  lines.push("## Competitive Advantages");
  lines.push("");
  if (fitAnalysis.competitiveAdvantages.length === 0) {
    lines.push("None identified.");
  } else {
    for (const advantage of fitAnalysis.competitiveAdvantages) {
      lines.push(`- ${advantage}`);
    }
  }

  return lines.join("\n").trim() + "\n";
}
