# Changelog

## 2026-02-21 — Reliability and Contract Alignment

### Added
- Deterministic `fit-report.md` generation from existing `parsedJD` + `fitAnalysis` data.
- Shared output persistence utility used by both CLI and server flows.
- Server SSE completion payload now includes `outputDir`.
- New tests for:
  - LLM retry behavior under malformed/invalid structured outputs.
  - Scraper extraction and short-content failure mode.
  - Parser empty-input validation.
  - Server API contracts (CORS and persisted output artifacts).

### Changed
- Token accounting moved from global module state to per-`LLMClient` instance state.
- Orchestrator now reads token summary from the active `LLMClient` instance.
- CLI now writes `fit-report.md` and uses shared output writer for artifact consistency.
- Server now persists analysis artifacts to `output/` using the same writer as CLI.
- Scraper upgraded to `@mozilla/readability` + `cheerio` extraction with fallback heuristics.
- CLI adds interactive fallback to paste JD text when URL scraping fails in TTY mode.
- Validator now enforces cover-letter max length of 400 words.
- Validator company mention checks now use normalized multi-token matching.
- Server hardening:
  - Request size limits (`1MB` JSON, `10MB` multipart).
  - Configurable CORS allowlist via `CORS_ALLOWED_ORIGINS`.
  - Explicit 403 for blocked preflight origins.

### Documentation
- Clarified intentional design choices:
  - `INTAKE` as context/state-history marker (graph starts at `PARSE_JD`).
  - Anthropic-first provider implementation scope.
  - `compare` command as directory-based offline comparison.

### Notes
- Test output noise reduced by silencing console logs in retry/scraper/parser tests.
- Existing UI warning in `public/index.html` remains unrelated to this release slice.
