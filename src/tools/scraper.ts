import https from "https";
import http from "http";
import { getCached, setCache } from "../utils/cache.js";

/**
 * Scrapes a job posting URL and extracts clean text.
 * Uses Node built-in https module — zero dependencies.
 *
 * Strategy:
 * 1. Fetch the HTML
 * 2. Strip script/style tags
 * 3. Extract text from common job posting containers
 * 4. Clean up whitespace
 *
 * Fallback: if scraping fails, caller prompts user to paste JD text.
 */

export interface ScrapeResult {
  text: string;
  title: string;
  url: string;
  contentLength: number;
}

function fetchUrl(url: string, maxRedirects = 5): Promise<string> {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      reject(new Error("Too many redirects"));
      return;
    }

    const client = url.startsWith("https") ? https : http;

    const req = client.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        timeout: 15000,
      },
      (res) => {
        // Handle redirects
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          const redirectUrl = res.headers.location.startsWith("http")
            ? res.headers.location
            : new URL(res.headers.location, url).toString();
          fetchUrl(redirectUrl, maxRedirects - 1).then(resolve, reject);
          return;
        }

        if (res.statusCode && res.statusCode >= 400) {
          reject(
            new Error(`HTTP ${res.statusCode} fetching ${url}`)
          );
          return;
        }

        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
        res.on("error", reject);
      }
    );

    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${url}`));
    });
    req.on("error", reject);
  });
}

/**
 * Extract readable text from raw HTML.
 * A lightweight approach without Cheerio/Readability:
 * - Remove script, style, nav, footer, header tags
 * - Extract text from the main content area
 * - Clean up whitespace
 */
function htmlToText(html: string): { text: string; title: string } {
  // Extract title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch
    ? titleMatch[1].replace(/\s+/g, " ").trim()
    : "Untitled";

  // Remove unwanted sections
  let cleaned = html;

  // Remove script, style, nav, footer, header, svg, iframe
  const removeTags = [
    "script",
    "style",
    "nav",
    "footer",
    "header",
    "svg",
    "iframe",
    "noscript",
  ];
  for (const tag of removeTags) {
    const regex = new RegExp(
      `<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`,
      "gi"
    );
    cleaned = cleaned.replace(regex, "");
  }

  // Try to find main content area
  const mainContentPatterns = [
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<div[^>]*class="[^"]*(?:job|posting|description|content|main)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*id="[^"]*(?:job|posting|description|content|main)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  ];

  let contentHtml = cleaned;
  for (const pattern of mainContentPatterns) {
    const match = cleaned.match(pattern);
    if (match && match[1] && match[1].length > 200) {
      contentHtml = match[1];
      break;
    }
  }

  // Convert common HTML elements to readable text
  let text = contentHtml
    // Line breaks for block elements
    .replace(/<(?:p|div|br|h[1-6]|li|tr|section)[^>]*>/gi, "\n")
    .replace(/<\/(?:p|div|h[1-6]|li|tr|section)>/gi, "\n")
    // Bullets for list items
    .replace(/<li[^>]*>/gi, "\n• ")
    // Strip all remaining HTML tags
    .replace(/<[^>]+>/g, " ")
    // Decode common HTML entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    // Clean up whitespace
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { text, title };
}

export async function scrapeJobPosting(
  url: string
): Promise<ScrapeResult> {
  console.log(`🌐 Scraping: ${url}`);

  // Check cache first
  const cached = getCached<ScrapeResult>("scrape", url);
  if (cached) return cached;

  try {
    const html = await fetchUrl(url);
    console.log(`  ✓ Fetched ${html.length} bytes`);

    const { text, title } = htmlToText(html);

    if (text.length < 100) {
      throw new Error(
        "Extracted text is too short — page might require JavaScript rendering. Try pasting the JD text directly."
      );
    }

    console.log(
      `  ✓ Extracted ${text.length} chars of text (title: "${title.slice(0, 60)}")`
    );

    const result: ScrapeResult = {
      text,
      title,
      url,
      contentLength: text.length,
    };

    setCache("scrape", url, result);
    return result;
  } catch (err: any) {
    console.error(`  ✗ Scraping failed: ${err.message}`);
    throw new Error(
      `Could not scrape ${url}: ${err.message}. Try pasting the job description text directly.`
    );
  }
}
