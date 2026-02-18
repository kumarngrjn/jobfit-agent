import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CACHE_DIR = join(__dirname, "../../.cache");

/**
 * Simple file-based cache to avoid re-processing identical inputs.
 * Cache key is a SHA-256 hash of the input content.
 */

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function hashKey(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

export function getCached<T>(namespace: string, content: string): T | null {
  const key = hashKey(content);
  const filePath = join(CACHE_DIR, `${namespace}_${key}.json`);

  if (!existsSync(filePath)) return null;

  try {
    const raw = readFileSync(filePath, "utf-8");
    const entry = JSON.parse(raw);

    // Check TTL (default: 24 hours)
    const ttlMs = 24 * 60 * 60 * 1000;
    if (Date.now() - entry.timestamp > ttlMs) {
      return null; // Expired
    }

    console.log(`  ⚡ Cache hit (${namespace})`);
    return entry.data as T;
  } catch {
    return null;
  }
}

export function setCache<T>(
  namespace: string,
  content: string,
  data: T
): void {
  ensureCacheDir();
  const key = hashKey(content);
  const filePath = join(CACHE_DIR, `${namespace}_${key}.json`);

  const entry = {
    timestamp: Date.now(),
    namespace,
    keyHash: key,
    data,
  };

  writeFileSync(filePath, JSON.stringify(entry));
}
