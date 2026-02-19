import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getCached, setCache } from "../../src/utils/cache.js";
import { existsSync, rmSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, "../../.cache");

// Suppress console output
vi.spyOn(console, "log").mockImplementation(() => {});

// Clean up test cache entries after each test
const testNamespaces = ["test_ns", "test_a", "test_b"];
afterEach(() => {
  if (existsSync(CACHE_DIR)) {
    const files = readdirSync(CACHE_DIR);
    for (const file of files) {
      if (testNamespaces.some(ns => file.startsWith(ns))) {
        try { rmSync(join(CACHE_DIR, file)); } catch {}
      }
    }
  }
});

describe("cache", () => {
  it("returns null for cache miss", () => {
    const result = getCached("test_ns", "nonexistent-content-" + Date.now());
    expect(result).toBeNull();
  });

  it("returns data after setCache", () => {
    const data = { name: "test", value: 42 };
    const key = "cache-roundtrip-" + Date.now();

    setCache("test_ns", key, data);
    const result = getCached<typeof data>("test_ns", key);

    expect(result).toEqual(data);
  });

  it("different namespaces store separately", () => {
    const content = "same-content-" + Date.now();

    setCache("test_a", content, { from: "a" });
    setCache("test_b", content, { from: "b" });

    expect(getCached<{ from: string }>("test_a", content)?.from).toBe("a");
    expect(getCached<{ from: string }>("test_b", content)?.from).toBe("b");
  });

  it("returns null for expired cache entry", () => {
    const content = "expire-test-" + Date.now();
    setCache("test_ns", content, { data: "old" });

    // Mock Date.now to simulate 25 hours later
    const originalNow = Date.now;
    vi.spyOn(Date, "now").mockReturnValue(originalNow() + 25 * 60 * 60 * 1000);

    const result = getCached("test_ns", content);
    expect(result).toBeNull();

    vi.restoreAllMocks();
    // Re-suppress console.log after restoreAllMocks
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
});
