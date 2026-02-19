import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

export interface RunSummary {
  dir: string;
  date: string;
  company: string;
  role: string;
  score: number | null;
  validated: boolean | null;
  cost: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

export function loadAllRuns(outputRoot: string): RunSummary[] {
  if (!existsSync(outputRoot)) return [];

  const dirs = readdirSync(outputRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const runs: RunSummary[] = [];

  for (const dir of dirs) {
    const metaPath = join(outputRoot, dir, "metadata.json");
    const analysisPath = join(outputRoot, dir, "analysis.json");

    if (!existsSync(metaPath)) continue;

    try {
      const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
      const analysis = existsSync(analysisPath)
        ? JSON.parse(readFileSync(analysisPath, "utf-8"))
        : null;

      runs.push({
        dir,
        date: meta.timestamp?.split("T")[0] ?? dir.slice(0, 10),
        company: analysis?.parsedJD?.company ?? extractFromDir(dir, "company"),
        role: analysis?.parsedJD?.role ?? extractFromDir(dir, "role"),
        score: analysis?.fitAnalysis?.overallScore ?? null,
        validated: meta.validation?.passed ?? null,
        cost: meta.tokenUsage?.estimatedCost ?? null,
        inputTokens: meta.tokenUsage?.totalInputTokens ?? null,
        outputTokens: meta.tokenUsage?.totalOutputTokens ?? null,
      });
    } catch {
      // Skip malformed entries
    }
  }

  return runs;
}

function extractFromDir(dir: string, field: "company" | "role"): string {
  const parts = dir.split("_");
  if (parts.length < 3) return "Unknown";
  if (field === "company") return parts[1].replace(/-/g, " ");
  return parts.slice(2).join(" ").replace(/-/g, " ");
}
