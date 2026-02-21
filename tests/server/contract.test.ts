import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

let serverProcess: ChildProcessWithoutNullStreams;
let baseUrl: string;

async function waitForServer(url: string, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Server did not start in time");
}

function parseSSEEvents(raw: string): Array<{ event: string; data: any }> {
  const blocks = raw.split("\n\n").map((b) => b.trim()).filter(Boolean);
  const events: Array<{ event: string; data: any }> = [];

  for (const block of blocks) {
    const lines = block.split("\n");
    const eventLine = lines.find((line) => line.startsWith("event: "));
    const dataLine = lines.find((line) => line.startsWith("data: "));

    if (!eventLine || !dataLine) continue;
    const event = eventLine.slice("event: ".length).trim();
    const data = JSON.parse(dataLine.slice("data: ".length));
    events.push({ event, data });
  }

  return events;
}

beforeAll(async () => {
  const port = 3300 + Math.floor(Math.random() * 300);
  baseUrl = `http://127.0.0.1:${port}`;

  serverProcess = spawn("npx", ["tsx", "src/server.ts"], {
    env: {
      ...process.env,
      MOCK_LLM: "true",
      PORT: `${port}`,
    },
    stdio: "pipe",
  });

  await waitForServer(baseUrl);
});

afterAll(async () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill("SIGTERM");
  }
});

describe("server API contracts", () => {
  it("rejects disallowed CORS origin in preflight", async () => {
    const response = await fetch(`${baseUrl}/api/runs`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.example.com",
      },
    });

    expect(response.status).toBe(403);
  });

  it("streams completion and persists output artifacts", async () => {
    const response = await fetch(`${baseUrl}/api/analyze/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jdText: "Staff software engineer role. Requires TypeScript, distributed systems, and mentoring.",
        resumeText: "Senior engineer with TypeScript and distributed systems experience. Mentored engineers.",
      }),
    });

    expect(response.status).toBe(200);
    const raw = await response.text();
    const events = parseSSEEvents(raw);

    const complete = events.find((event) => event.event === "complete");
    expect(complete).toBeTruthy();
    expect(complete!.data.outputDir).toBeTruthy();

    const outputDir = complete!.data.outputDir as string;
    expect(existsSync(join(outputDir, "analysis.json"))).toBe(true);
    expect(existsSync(join(outputDir, "fit-report.md"))).toBe(true);
    expect(existsSync(join(outputDir, "cover-letter.md"))).toBe(true);
    expect(existsSync(join(outputDir, "tailored-bullets.md"))).toBe(true);
    expect(existsSync(join(outputDir, "interview-prep.md"))).toBe(true);
    expect(existsSync(join(outputDir, "metadata.json"))).toBe(true);
  });
});
