import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import http from "http";
import { scrapeJobPosting } from "../../src/tools/scraper.js";

vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === "/rich") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`
        <html>
          <head><title>Staff Engineer Role</title></head>
          <body>
            <article>
              <h1>Staff Software Engineer</h1>
              <p>Build distributed systems at scale and mentor engineers.</p>
              <p>Required skills include TypeScript, Kubernetes, and observability.</p>
            </article>
          </body>
        </html>
      `);
      return;
    }

    if (req.url === "/tiny") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<html><body><p>tiny</p></body></html>");
      return;
    }

    res.writeHead(404);
    res.end("not found");
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to start test server");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

describe("scrapeJobPosting", () => {
  it("extracts meaningful text from HTML content", async () => {
    const result = await scrapeJobPosting(`${baseUrl}/rich`);

    expect(result.title).toContain("Staff Engineer Role");
    expect(result.text).toContain("Staff Software Engineer");
    expect(result.text).toContain("distributed systems");
    expect(result.contentLength).toBeGreaterThan(100);
  });

  it("fails when extracted content is too short", async () => {
    await expect(scrapeJobPosting(`${baseUrl}/tiny`)).rejects.toThrow("Try pasting the job description text directly");
  });
});
