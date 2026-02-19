import http from "http";
import { readFileSync, existsSync, writeFileSync, unlinkSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { LLMClient, getUsageSummary } from "./llm/client.js";
import { runOrchestrator } from "./agent/orchestrator.js";
import { scrapeJobPosting } from "./tools/scraper.js";
import { parseFileBuffer } from "./utils/file-parser.js";
import { loadAllRuns } from "./utils/run-loader.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PORT = parseInt(process.env.PORT ?? "3000", 10);
const OUTPUT_ROOT = join(__dirname, "../output");

// MIME types for static files
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

// --- Helpers ---

function sendJSON(res: http.ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function readBodyBuffer(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/**
 * Parse a multipart/form-data body.
 * Returns a map of field names to their values (string or { filename, buffer }).
 */
function parseMultipart(
  body: Buffer,
  contentType: string
): Record<string, string | { filename: string; buffer: Buffer }> {
  const boundaryMatch = contentType.match(/boundary=(.+)/);
  if (!boundaryMatch) throw new Error("No boundary in content-type");

  const boundary = boundaryMatch[1].replace(/^["']|["']$/g, "");
  const parts: Record<string, string | { filename: string; buffer: Buffer }> = {};

  const bodyStr = body.toString("latin1"); // preserve binary
  const segments = bodyStr.split(`--${boundary}`);

  for (const segment of segments) {
    if (segment.trim() === "" || segment.trim() === "--") continue;

    const headerEnd = segment.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;

    const headers = segment.slice(0, headerEnd);
    const content = segment.slice(headerEnd + 4).replace(/\r\n$/, "");

    const nameMatch = headers.match(/name="([^"]+)"/);
    if (!nameMatch) continue;

    const name = nameMatch[1];
    const filenameMatch = headers.match(/filename="([^"]+)"/);

    if (filenameMatch) {
      // File field — convert back to buffer
      parts[name] = {
        filename: filenameMatch[1],
        buffer: Buffer.from(content, "latin1"),
      };
    } else {
      parts[name] = content.trim();
    }
  }

  return parts;
}

// --- Request Handler ---

async function handler(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = req.url ?? "/";
  const method = req.method ?? "GET";

  // CORS preflight
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  // API: POST /api/analyze
  if (method === "POST" && url === "/api/analyze") {
    try {
      let jdText = "";
      let resumeText = "";

      const contentType = req.headers["content-type"] ?? "";

      if (contentType.includes("multipart/form-data")) {
        // Handle multipart upload (URL + file)
        const body = await readBodyBuffer(req);
        const fields = parseMultipart(body, contentType);

        // JD: either URL (scrape it) or pasted text
        const jdUrl = typeof fields.jdUrl === "string" ? fields.jdUrl.trim() : "";
        const jdTextRaw = typeof fields.jdText === "string" ? fields.jdText.trim() : "";

        if (jdUrl) {
          const scrapeResult = await scrapeJobPosting(jdUrl);
          jdText = scrapeResult.text;
        } else if (jdTextRaw) {
          jdText = jdTextRaw;
        }

        // Resume: either uploaded file or pasted text
        const resumeFile = fields.resumeFile;
        const resumeTextRaw = typeof fields.resumeText === "string" ? fields.resumeText.trim() : "";

        if (resumeFile && typeof resumeFile !== "string") {
          const parsed = await parseFileBuffer(resumeFile.buffer, resumeFile.filename);
          resumeText = parsed.text;
        } else if (resumeTextRaw) {
          resumeText = resumeTextRaw;
        }
      } else {
        // JSON body (backward compatible)
        const rawBody = await readBody(req);
        const body = JSON.parse(rawBody);

        // Support jdUrl field for URL scraping
        if (body.jdUrl?.trim()) {
          const scrapeResult = await scrapeJobPosting(body.jdUrl);
          jdText = scrapeResult.text;
        } else {
          jdText = body.jdText ?? "";
        }

        resumeText = body.resumeText ?? "";
      }

      if (!jdText?.trim()) {
        sendJSON(res, 400, { error: "Job description text is required. Provide jdText or jdUrl." });
        return;
      }
      if (!resumeText?.trim()) {
        sendJSON(res, 400, { error: "Resume text is required. Provide resumeText or upload a file." });
        return;
      }

      console.log(`\n📥 Analyze request: JD ${jdText.length} chars, Resume ${resumeText.length} chars`);

      const llm = new LLMClient({
        model: "claude-sonnet-4-5-20250929",
        maxRetries: 2,
        maxTokens: 4096,
      });

      // Run the full orchestrator pipeline
      const result = await runOrchestrator(jdText, resumeText, llm);
      const ctx = result.context;

      if (!result.success) {
        sendJSON(res, 500, {
          error: "Analysis pipeline failed",
          details: ctx.errors,
          partialData: {
            parsedJD: ctx.parsedJD,
            parsedResume: ctx.parsedResume,
            fitAnalysis: ctx.fitAnalysis,
          },
        });
        return;
      }

      sendJSON(res, 200, {
        parsedJD: ctx.parsedJD,
        parsedResume: ctx.parsedResume,
        fitAnalysis: ctx.fitAnalysis,
        outputs: {
          coverLetter: ctx.outputs.coverLetter,
          tailoredBullets: ctx.outputs.tailoredBullets,
          interviewPrep: ctx.outputs.interviewPrep,
        },
        validation: ctx.validation,
        metadata: {
          model: "claude-sonnet-4-5-20250929",
          tokenUsage: result.tokenUsage,
          totalDurationMs: result.totalDurationMs,
          stateHistory: ctx.stateHistory,
          validationAttempts: ctx.validationAttempts,
        },
      });

      console.log(`✅ Analysis complete — score: ${ctx.fitAnalysis?.overallScore}/100`);
    } catch (err: any) {
      console.error("❌ Analysis failed:", err.message);
      sendJSON(res, 500, { error: err.message });
    }
    return;
  }

  // API: GET /api/runs
  if (method === "GET" && url.startsWith("/api/runs") && !url.startsWith("/api/runs/costs") && !url.startsWith("/api/runs/compare")) {
    try {
      const runs = loadAllRuns(OUTPUT_ROOT);
      const params = new URL(url, `http://localhost`).searchParams;
      const sort = params.get("sort") ?? "date";

      if (sort === "score") {
        runs.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      } else if (sort === "cost") {
        runs.sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0));
      } else {
        runs.sort((a, b) => b.date.localeCompare(a.date));
      }

      sendJSON(res, 200, runs);
    } catch (err: any) {
      sendJSON(res, 500, { error: err.message });
    }
    return;
  }

  // API: GET /api/runs/costs
  if (method === "GET" && url.startsWith("/api/runs/costs")) {
    try {
      const runs = loadAllRuns(OUTPUT_ROOT);
      runs.sort((a, b) => b.date.localeCompare(a.date));

      let totalInput = 0;
      let totalOutput = 0;
      let totalCost = 0;
      for (const run of runs) {
        totalInput += run.inputTokens ?? 0;
        totalOutput += run.outputTokens ?? 0;
        totalCost += run.cost ?? 0;
      }

      sendJSON(res, 200, {
        runs,
        totals: { inputTokens: totalInput, outputTokens: totalOutput, totalCost },
      });
    } catch (err: any) {
      sendJSON(res, 500, { error: err.message });
    }
    return;
  }

  // API: POST /api/runs/compare
  if (method === "POST" && url === "/api/runs/compare") {
    try {
      const rawBody = await readBody(req);
      const { dirs } = JSON.parse(rawBody);

      if (!Array.isArray(dirs) || dirs.length < 2) {
        sendJSON(res, 400, { error: "Provide at least 2 directory names to compare." });
        return;
      }

      const analyses: { dir: string; company: string; role: string; score: number; matches: number; gaps: number; advantages: string[] }[] = [];

      for (const dir of dirs) {
        const analysisPath = join(OUTPUT_ROOT, dir, "analysis.json");
        if (!existsSync(analysisPath)) continue;

        const data = JSON.parse(readFileSync(analysisPath, "utf-8"));
        const fit = data.fitAnalysis;
        analyses.push({
          dir,
          company: data.parsedJD?.company ?? "Unknown",
          role: data.parsedJD?.role ?? "Unknown",
          score: fit?.overallScore ?? 0,
          matches: fit?.strongMatches?.length ?? 0,
          gaps: fit?.gaps?.length ?? 0,
          advantages: fit?.competitiveAdvantages ?? [],
        });
      }

      analyses.sort((a, b) => b.score - a.score);
      sendJSON(res, 200, { analyses });
    } catch (err: any) {
      sendJSON(res, 500, { error: err.message });
    }
    return;
  }

  // Serve static files (UI)
  if (method === "GET") {
    let filePath = url === "/" ? "/index.html" : url;
    const fullPath = join(__dirname, "../public", filePath);

    if (existsSync(fullPath)) {
      const ext = extname(fullPath);
      const mime = MIME_TYPES[ext] ?? "application/octet-stream";
      const content = readFileSync(fullPath, "utf-8");
      res.writeHead(200, { "Content-Type": mime });
      res.end(content);
      return;
    }
  }

  // 404
  sendJSON(res, 404, { error: "Not found" });
}

// --- Start Server ---

const server = http.createServer(handler);

server.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║       JobFit Agent — Web UI          ║`);
  console.log(`╠══════════════════════════════════════╣`);
  console.log(`║  http://localhost:${PORT}               ║`);
  console.log(`║  Mode: ${process.env.MOCK_LLM === "true" ? "MOCK (no API calls)     " : "LIVE (Anthropic API)    "}  ║`);
  console.log(`╚══════════════════════════════════════╝\n`);
});
