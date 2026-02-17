import http from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { LLMClient, getUsageSummary } from "./llm/client.js";
import { runOrchestrator } from "./agent/orchestrator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PORT = parseInt(process.env.PORT ?? "3000", 10);

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
      const rawBody = await readBody(req);
      const { jdText, resumeText } = JSON.parse(rawBody);

      if (!jdText?.trim()) {
        sendJSON(res, 400, { error: "Job description text is required" });
        return;
      }
      if (!resumeText?.trim()) {
        sendJSON(res, 400, { error: "Resume text is required" });
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
          model: llm instanceof LLMClient ? "claude-sonnet-4-5-20250929" : "unknown",
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
