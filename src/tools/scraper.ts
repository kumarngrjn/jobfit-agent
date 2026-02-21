import https from "https";
import http from "http";
import { load } from "cheerio";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { getCached, setCache } from "../utils/cache.js";

/**
 * Scrapes a job posting URL and extracts clean text.
 * Uses Readability + Cheerio for robust extraction.
 *
 * Strategy:
 * 1. Fetch the HTML
 * 2. Extract article text via Readability
 * 3. Fallback extraction via Cheerio heuristics
 * 4. Normalize whitespace
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

function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractTitle(html: string): string {
  const $ = load(html);
  return $("title").first().text().trim() || "Untitled";
}

function extractWithReadability(html: string, url: string): string {
  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();
  return normalizeText(article?.textContent ?? "");
}

function extractWithCheerio(html: string): string {
  const $ = load(html);

  $("script, style, nav, footer, header, svg, iframe, noscript").remove();

  const candidates = [
    "main",
    "article",
    '[class*="job-description"]',
    '[class*="job-posting"]',
    '[class*="description"]',
    '[id*="job-description"]',
    '[id*="job-posting"]',
    '[id*="description"]',
  ];

  let bestText = "";

  for (const selector of candidates) {
    const text = normalizeText($(selector).first().text());
    if (text.length > bestText.length) {
      bestText = text;
    }
  }

  if (bestText.length >= 100) {
    return bestText;
  }

  return normalizeText($("body").text());
}

function htmlToText(html: string, url: string): { text: string; title: string } {
  const title = extractTitle(html);
  const readabilityText = extractWithReadability(html, url);
  const cheerioText = extractWithCheerio(html);

  const text = readabilityText.length >= cheerioText.length ? readabilityText : cheerioText;

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

    const { text, title } = htmlToText(html, url);

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
