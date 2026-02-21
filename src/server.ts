import http from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { LLMClient } from "./llm/client.js";
import { runOrchestrator } from "./agent/orchestrator.js";
import { AgentState, PipelineContext } from "./agent/state.js";
import { scrapeJobPosting } from "./tools/scraper.js";
import { parseFileBuffer } from "./utils/file-parser.js";
import { loadAllRuns } from "./utils/run-loader.js";
import { writeRunOutputs } from "./utils/output-writer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PORT = parseInt(process.env.PORT ?? "3000", 10);
const OUTPUT_ROOT = join(__dirname, "../output");
const MAX_JSON_BODY_BYTES = 1 * 1024 * 1024;
const MAX_MULTIPART_BODY_BYTES = 10 * 1024 * 1024;

class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

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

function getAllowedOrigins(): Set<string> {
  const configured = (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configured.length > 0) {
    return new Set(configured);
  }

  return new Set([
    `http://localhost:${PORT}`,
    `http://127.0.0.1:${PORT}`,
  ]);
}

const ALLOWED_ORIGINS = getAllowedOrigins();

function buildCorsHeaders(req: http.IncomingMessage): Record<string, string> {
  const origin = req.headers.origin;
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (!origin) {
    return headers;
  }

  if (ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }

  return headers;
}

function sendJSON(req: http.IncomingMessage, res: http.ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    ...buildCorsHeaders(req),
  });
  res.end(JSON.stringify(data));
}

function initSSE(req: http.IncomingMessage, res: http.ServerResponse) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    ...buildCorsHeaders(req),
  });
}

function sendSSE(res: http.ServerResponse, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function readBody(req: http.IncomingMessage, maxBytes = MAX_JSON_BODY_BYTES): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    let total = 0;

    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new HttpError(413, `Request body too large. Max allowed is ${maxBytes} bytes.`));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function readBodyBuffer(req: http.IncomingMessage, maxBytes = MAX_MULTIPART_BODY_BYTES): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new HttpError(413, `Upload too large. Max allowed is ${maxBytes} bytes.`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
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

// --- Shared input parsing ---

const STATE_LABELS: Record<string, string> = {
  PARSE_JD: "Reading job posting...",
  PARSE_RESUME: "Reading resume...",
  ANALYZE_FIT: "Analyzing fit...",
  GENERATE_OUTPUTS: "Writing outputs...",
  VALIDATE: "Running quality check...",
};

const PIPELINE_STATES = ["PARSE_JD", "PARSE_RESUME", "ANALYZE_FIT", "GENERATE_OUTPUTS", "VALIDATE"];

async function parseAnalyzeInput(req: http.IncomingMessage): Promise<{ jdText: string; resumeText: string; jdSource: string; resumeSource: string }> {
  let jdText = "";
  let resumeText = "";
  let jdSource = "";
  let resumeSource = "";

  const contentType = req.headers["content-type"] ?? "";

  if (contentType.includes("multipart/form-data")) {
    const body = await readBodyBuffer(req, MAX_MULTIPART_BODY_BYTES);
    const fields = parseMultipart(body, contentType);

    const jdUrl = typeof fields.jdUrl === "string" ? fields.jdUrl.trim() : "";
    const jdTextRaw = typeof fields.jdText === "string" ? fields.jdText.trim() : "";

    if (jdUrl) {
      const scrapeResult = await scrapeJobPosting(jdUrl);
      jdText = scrapeResult.text;
      jdSource = jdUrl;
    } else if (jdTextRaw) {
      jdText = jdTextRaw;
      jdSource = "pasted-text";
    }

    const resumeFile = fields.resumeFile;
    const resumeTextRaw = typeof fields.resumeText === "string" ? fields.resumeText.trim() : "";

    if (resumeFile && typeof resumeFile !== "string") {
      const parsed = await parseFileBuffer(resumeFile.buffer, resumeFile.filename);
      resumeText = parsed.text;
      resumeSource = `upload:${resumeFile.filename}`;
    } else if (resumeTextRaw) {
      resumeText = resumeTextRaw;
      resumeSource = "pasted-text";
    }
  } else {
    const rawBody = await readBody(req, MAX_JSON_BODY_BYTES);
    const body = JSON.parse(rawBody);

    if (body.jdUrl?.trim()) {
      const scrapeResult = await scrapeJobPosting(body.jdUrl);
      jdText = scrapeResult.text;
      jdSource = body.jdUrl;
    } else {
      jdText = body.jdText ?? "";
      jdSource = "pasted-text";
    }

    resumeText = body.resumeText ?? "";
    resumeSource = "pasted-text";
  }

  return { jdText, resumeText, jdSource, resumeSource };
}

function buildResultPayload(result: Awaited<ReturnType<typeof runOrchestrator>>, outputDir?: string) {
  const ctx = result.context;
  return {
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
    ...(outputDir ? { outputDir } : {}),
  };
}

// --- Request Handler ---

async function handler(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = req.url ?? "/";
  const method = req.method ?? "GET";

  // CORS preflight
  if (method === "OPTIONS") {
    const corsHeaders = buildCorsHeaders(req);
    if (req.headers.origin && !corsHeaders["Access-Control-Allow-Origin"]) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Origin not allowed" }));
      return;
    }

    res.writeHead(204, {
      ...corsHeaders,
    });
    res.end();
    return;
  }

  // API: POST /api/analyze/stream (SSE)
  if (method === "POST" && url === "/api/analyze/stream") {
    try {
      const { jdText, resumeText, jdSource, resumeSource } = await parseAnalyzeInput(req);

      if (!jdText?.trim()) {
        sendJSON(req, res, 400, { error: "Job description text is required. Provide jdText or jdUrl." });
        return;
      }
      if (!resumeText?.trim()) {
        sendJSON(req, res, 400, { error: "Resume text is required. Provide resumeText or upload a file." });
        return;
      }

      console.log(`\n📥 Analyze request (stream): JD ${jdText.length} chars, Resume ${resumeText.length} chars`);

      initSSE(req, res);

      let clientConnected = true;
      req.on("close", () => { clientConnected = false; });

      const completedStates: string[] = [];

      const onStateChange = (state: AgentState, ctx: PipelineContext) => {
        if (!clientConnected) return;

        const stateStr = state as string;
        const idx = PIPELINE_STATES.indexOf(stateStr);

        if (idx >= 0) {
          let label = STATE_LABELS[stateStr] ?? stateStr;
          if (stateStr === "VALIDATE" && ctx.validationAttempts > 1) {
            label = `Re-checking quality (attempt ${ctx.validationAttempts})...`;
          }
          if (stateStr === "GENERATE_OUTPUTS" && ctx.validationAttempts > 0) {
            label = `Re-writing outputs (attempt ${ctx.validationAttempts + 1})...`;
          }

          // The previous state is now completed
          if (idx > 0) {
            const prevState = PIPELINE_STATES[idx - 1];
            if (prevState && !completedStates.includes(prevState)) {
              completedStates.push(prevState);
            }
          }

          sendSSE(res, "state", {
            state: stateStr,
            step: idx + 1,
            totalSteps: PIPELINE_STATES.length,
            label,
            completedStates: [...completedStates],
          });
        }

        // Send partial results as each stage completes
        if (stateStr === "PARSE_RESUME" && ctx.parsedJD) {
          sendSSE(res, "partial", { type: "parsedJD", data: ctx.parsedJD });
        }
        if (stateStr === "ANALYZE_FIT" && ctx.parsedResume) {
          sendSSE(res, "partial", { type: "parsedResume", data: ctx.parsedResume });
        }
        if (stateStr === "GENERATE_OUTPUTS" && ctx.fitAnalysis) {
          sendSSE(res, "partial", { type: "fitAnalysis", data: ctx.fitAnalysis });
        }
        if (stateStr === "VALIDATE" && ctx.outputs) {
          sendSSE(res, "partial", { type: "outputs", data: ctx.outputs });
        }
      };

      const llm = new LLMClient({
        model: "claude-sonnet-4-5-20250929",
        maxRetries: 2,
        maxTokens: 4096,
      });

      const result = await runOrchestrator(jdText, resumeText, llm, onStateChange);

      const now = new Date();
      const dateStr = now.toISOString().split("T")[0];
      const company = (result.context.parsedJD?.company ?? "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const role = (result.context.parsedJD?.role ?? "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const outputDir = join(OUTPUT_ROOT, `${dateStr}_${company}_${role}`);

      writeRunOutputs(outputDir, result.context, {
        timestamp: now.toISOString(),
        success: result.success,
        totalDurationMs: result.totalDurationMs,
        jdSource,
        resumeSource,
        tokenUsage: result.tokenUsage,
      });

      if (clientConnected) {
        if (!result.success) {
          sendSSE(res, "error", {
            error: "Analysis pipeline failed",
            details: result.context.errors,
          });
        } else {
          sendSSE(res, "complete", buildResultPayload(result, outputDir));
          console.log(`✅ Analysis complete — score: ${result.context.fitAnalysis?.overallScore}/100`);
        }
        res.end();
      }
    } catch (err: any) {
      console.error("❌ Analysis failed:", err.message);
      if (!res.headersSent) {
        const status = err?.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 500;
        sendJSON(req, res, status, { error: err.message });
      } else {
        sendSSE(res, "error", { error: err.message });
        res.end();
      }
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

      sendJSON(req, res, 200, runs);
    } catch (err: any) {
      const status = err?.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 500;
      sendJSON(req, res, status, { error: err.message });
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

      sendJSON(req, res, 200, {
        runs,
        totals: { inputTokens: totalInput, outputTokens: totalOutput, totalCost },
      });
    } catch (err: any) {
      const status = err?.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 500;
      sendJSON(req, res, status, { error: err.message });
    }
    return;
  }

  // API: POST /api/runs/compare
  if (method === "POST" && url === "/api/runs/compare") {
    try {
      const rawBody = await readBody(req, MAX_JSON_BODY_BYTES);
      const { dirs } = JSON.parse(rawBody);

      if (!Array.isArray(dirs) || dirs.length < 2) {
        sendJSON(req, res, 400, { error: "Provide at least 2 directory names to compare." });
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
      sendJSON(req, res, 200, { analyses });
    } catch (err: any) {
      const status = err?.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 500;
      sendJSON(req, res, status, { error: err.message });
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
  sendJSON(req, res, 404, { error: "Not found" });
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
