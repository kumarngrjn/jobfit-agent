# JobFit Agent

AI-powered job application analyzer. Given a job posting and your resume, get a complete application package: fit score, gap analysis, tailored cover letter, resume bullets, and interview prep.

Built with TypeScript, the Anthropic Claude API, and Zod for structured output validation. No frameworks — the agent loop, graph-based state machine, and orchestrator are all built from scratch.

## What It Does

Given a **job posting** (URL or text) and your **resume** (.txt, .md, .pdf, .docx), JobFit Agent runs a multi-step AI pipeline:

1. **Parses the JD** into structured data (skills, responsibilities, tech stack, red flags)
2. **Parses your resume** into structured data (experience, skills, certifications)
3. **Analyzes fit** — scores your match, identifies gaps, suggests how to reframe experience
4. **Generates a cover letter** tailored to the role's top requirements
5. **Generates resume bullets** in STAR format, mapped to JD keywords
6. **Generates interview prep** — likely questions with talking points from your experience
7. **Self-validates** all outputs and retries if quality is low

## Architecture

```
┌─────────────────────────────────────────────────────┐
│               CLI (Commander.js) / Web UI            │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│            GRAPH-BASED AGENT RUNNER                  │
│                                                      │
│  while (not terminal):                               │
│    handler = graph.nodes.get(currentState)           │
│    nextState = await handler(ctx, llm)               │
│                                                      │
│  Nodes: PARSE_JD → PARSE_RESUME → ANALYZE_FIT       │
│       → GENERATE_OUTPUTS → VALIDATE → DONE           │
│         (VALIDATE loops back on failure)              │
└──────┬───────┬────────┬────────┬────────┬───────────┘
       │       │        │        │        │
  ┌────▼──┐ ┌─▼────┐ ┌─▼────┐ ┌▼─────┐ ┌▼──────┐
  │  JD   │ │Resume│ │ Gap  │ │Output│ │Valid- │
  │Parser │ │Parser│ │Analyz│ │ Gens │ │ator  │
  └───────┘ └──────┘ └──────┘ └──────┘ └───────┘
```

Key design decisions:

- **Custom graph-based agent loop** — nodes return the next state, the runner follows edges. Like LangGraph, but in ~20 lines
- **Zod schemas** validate every LLM response — retry on validation failure
- **Parallel generation** — cover letter, bullets, and interview prep run concurrently
- **Self-validation** — the agent checks its own output quality before returning
- **Caching** — SHA-256 hashed file cache avoids re-parsing identical inputs
- **Token tracking** — every run logs token usage and estimated cost

## CLI Usage

### Analyze a job posting

```bash
# From a URL
jobfit analyze https://careers.example.com/staff-swe --resume ./resume.pdf

# From a text file
jobfit analyze ./job-description.txt --resume ./resume.txt

# With mock data (no API key needed)
jobfit analyze ./jd.txt --resume ./resume.txt --mock

# Verbose output
jobfit analyze ./jd.txt --resume ./resume.txt --verbose

# Custom output directory
jobfit analyze ./jd.txt --resume ./resume.txt --output ./my-output
```

### List tracked applications

```bash
jobfit list                  # sorted by date (default)
jobfit list --sort score     # sorted by fit score
jobfit list --sort cost      # sorted by API cost
```

### Compare applications

```bash
jobfit compare 2026-02-18_acme_staff-swe 2026-02-18_globex_senior-swe
```

### View cost report

```bash
jobfit costs
```

## Quick Start

```bash
# Clone and install
git clone https://github.com/kumarngrjn/jobfit-agent.git
cd jobfit-agent
npm install

# Set up your API key
cp .env.example .env
# Edit .env and add your Anthropic API key

# Run via npm scripts
npm run analyze:mock     # mock mode, no API key needed

# Or install globally
npm run build
npm link
jobfit analyze ./jd.txt --resume ./resume.pdf
```

### Web UI

```bash
npm run dev              # development (tsx, auto-reload)
npm start                # production (built JS)
npm run start:mock       # mock mode
# Open http://localhost:3000
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes (unless mock) | Your Anthropic API key |
| `MOCK_LLM` | No | Set to `true` for offline development |

## Project Structure

```
src/
├── cli.ts                     # Commander.js CLI (analyze, list, compare, costs)
├── index.ts                   # Programmatic API exports
├── server.ts                  # HTTP server with multipart upload
├── agent/
│   ├── graph.ts               # Graph runner, node handlers, agent graph definition
│   ├── orchestrator.ts        # Thin wrapper: creates graph → runs it
│   ├── state.ts               # AgentState enum, PipelineContext, transitions
│   └── validator.ts           # Output quality validation
├── tools/
│   ├── jd-parser.ts           # Job description → structured data (cached)
│   ├── resume-parser.ts       # Resume → structured data (cached)
│   ├── gap-analyzer.ts        # JD + Resume → fit analysis
│   ├── scraper.ts             # URL scraper for job postings (cached)
│   └── generators/
│       ├── cover-letter.ts    # Tailored cover letter
│       ├── resume-bullets.ts  # STAR-format bullet points
│       └── interview-prep.ts  # Technical & behavioral prep
├── utils/
│   ├── file-parser.ts         # PDF/DOCX/TXT/MD file parser
│   ├── cache.ts               # File-based cache (SHA-256, 24hr TTL)
│   └── logger.ts              # Structured JSON logging
└── llm/
    ├── client.ts              # Anthropic SDK wrapper with retries & token tracking
    ├── schemas.ts             # Zod schemas for all structured types
    ├── prompts.ts             # Prompt templates
    └── mock-data.ts           # Mock data for offline development
public/
└── index.html                 # React UI (CDN-loaded, zero build step)
tests/
└── fixtures/                  # Sample JD and resume for testing
```

## Tech Stack

| Component | Technology | Why |
|---|---|---|
| Language | TypeScript | Type safety for structured LLM outputs |
| Runtime | Node.js 20+ | Built-in HTTP server, no Express needed |
| LLM | Anthropic Claude (Sonnet) | Structured output quality |
| Validation | Zod v4 | Schema validation + documentation |
| Agent | Custom graph runner | Full control, no framework overhead |
| CLI | Commander.js | Clean multi-command CLI |
| File parsing | mammoth + pdftotext | DOCX and PDF resume support |
| UI | React (CDN) | Single-file, zero build step |

## How It Works

The orchestrator builds an **agent graph** and hands it to a generic graph runner:

```typescript
// Graph definition — nodes are handlers, edges are return values
const graph = createAgentGraph();
// nodes: PARSE_JD → PARSE_RESUME → ANALYZE_FIT → GENERATE_OUTPUTS → VALIDATE

// Graph runner — loops until terminal state
while (!graph.terminalStates.has(currentState)) {
  const handler = graph.nodes.get(currentState);
  currentState = await handler(ctx, llm);  // handler returns next state
}
```

Each handler does its work, mutates the shared `PipelineContext`, and returns the next state. The VALIDATE handler has a **conditional edge** — it returns either `DONE` (passed) or `GENERATE_OUTPUTS` (retry), making it a real graph with branching.

## Sample Output

```
╔══════════════════════════════════════╗
║       JobFit Agent — Analyzer        ║
╚══════════════════════════════════════╝

📊 Fit Score: 82/100
✅ Strong matches: 8  |  ⚠️ Gaps: 3  |  🎯 Reframe: 4

Generated:
- analysis.json       (Full structured data)
- cover-letter.md     ✓
- tailored-bullets.md ✓
- interview-prep.md   ✓
- metadata.json       (Run metadata & costs)
- logs.json           (Structured logs)

📝 Validation: PASSED (1 attempt)
⏱  Duration: 45200ms
💰 Tokens: 12,340 (~$0.2150)
```

## Roadmap

- [x] Phase 1: Foundation (LLM client, parsers, basic pipeline)
- [x] Phase 2: Agent loop (graph-based state machine, generators, validation)
- [x] Phase 3: URL scraping, PDF/DOCX parsing, caching
- [x] Phase 4: CLI with Commander.js, cost tracking, structured logging
- [ ] Phase 5: SQLite storage, application tracking, Next.js dashboard

## License

MIT
