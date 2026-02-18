import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { execSync } from "child_process";
import { extname } from "path";

/**
 * Extracts text from various file formats.
 * Supports: .txt, .md, .pdf
 *
 * PDF parsing uses the system `pdftotext` command (poppler-utils).
 * No npm dependencies required.
 */

export interface ParsedFile {
  text: string;
  format: string;
  charCount: number;
}

export function parseFile(filePath: string): ParsedFile {
  const ext = extname(filePath).toLowerCase();

  switch (ext) {
    case ".txt":
    case ".md":
      return parseTextFile(filePath);
    case ".pdf":
      return parsePDF(filePath);
    default:
      throw new Error(
        `Unsupported file format: ${ext}. Supported: .txt, .md, .pdf`
      );
  }
}

function parseTextFile(filePath: string): ParsedFile {
  const text = readFileSync(filePath, "utf-8");
  return {
    text,
    format: extname(filePath).slice(1),
    charCount: text.length,
  };
}

function parsePDF(filePath: string): ParsedFile {
  console.log(`📑 Parsing PDF: ${filePath}`);

  try {
    // Use pdftotext from poppler-utils (available on most Linux/macOS systems)
    // -layout preserves the visual layout
    // - outputs to stdout
    const text = execSync(`pdftotext -layout "${filePath}" -`, {
      encoding: "utf-8",
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    const cleaned = text
      .replace(/\f/g, "\n") // form feeds
      .replace(/\r\n/g, "\n") // normalize line endings
      .replace(/\n{4,}/g, "\n\n\n") // cap consecutive blank lines
      .trim();

    if (cleaned.length < 50) {
      throw new Error(
        "PDF text extraction returned very little text. The PDF might be image-based (scanned). Try converting to text first."
      );
    }

    console.log(`  ✓ Extracted ${cleaned.length} chars from PDF`);

    return {
      text: cleaned,
      format: "pdf",
      charCount: cleaned.length,
    };
  } catch (err: any) {
    if (err.message?.includes("pdftotext")) {
      throw new Error(
        "pdftotext is not installed. Install poppler-utils: brew install poppler (macOS) or apt install poppler-utils (Linux)"
      );
    }
    throw new Error(`PDF parsing failed: ${err.message}`);
  }
}

/**
 * Parse text from a base64-encoded file buffer (for multipart uploads).
 */
export function parseFileBuffer(
  buffer: Buffer,
  filename: string
): ParsedFile {
  const ext = extname(filename).toLowerCase();

  if (ext === ".txt" || ext === ".md") {
    const text = buffer.toString("utf-8");
    return { text, format: ext.slice(1), charCount: text.length };
  }

  if (ext === ".pdf") {
    // Write to temp file, parse, clean up
    const tmpPath = `/tmp/jobfit-upload-${Date.now()}.pdf`;
    writeFileSync(tmpPath, buffer);
    try {
      const result = parsePDF(tmpPath);
      unlinkSync(tmpPath);
      return result;
    } catch (err) {
      try {
        unlinkSync(tmpPath);
      } catch {}
      throw err;
    }
  }

  throw new Error(
    `Unsupported file format: ${ext}. Supported: .txt, .md, .pdf`
  );
}
