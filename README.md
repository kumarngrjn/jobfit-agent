# JobFit Agent

AI-powered job application analyzer. Paste a job description and your resume, get a complete application package: fit score, gap analysis, tailored cover letter, resume bullets, and interview prep.

Built with TypeScript, the Anthropic Claude API, and Zod for structured output validation. No frameworks — the agent loop, state machine, and orchestrator are all built from scratch.

## What It Does

Given a **job posting** and your **resume**, JobFit Agent runs a multi-step AI pipeline:

1. **Parses the JD** into structured data (skills, responsibilities, tech stack, red flags)
2. **Parses your resume** into structured data (experience, skills, certifications)
3. **Analyzes fit** — scores your match, identifies gaps, and suggests how to reframe your experience
4. **Generates a cover letter** tailored to the role's top requirements
5. **Generates resume bullets** in STAR format, mapped to JD keywords
6. **Generates interview prep** — likely questions with talking points from your actual experience
7. **Self-validates** all outputs (length, keyword usage, specificity) and retries if quality is low

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Web UI / CLI                       │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│               ORCHESTRATOR (State Machine)           │
│                                                      │
│  INTAKE → PARSE_JD → PARSE_RESUME → ANALYZE_FIT     │
│        → GENERATE_OUTPUTS → VALIDATE → DONE          │
└──────┬───────┬────────┬────────┬────────┬───────────┘
       │       │        │        │        │
  ┌────▼──┐ ┌─▼────┐ ┌─▼────┐ ┌▼─────┐ ┌▼──────┐
  │  JD   │ │Resume│ │ Gap  │ │Output│ │Valid- │
  │Parser │ │Parser│ │Analyz│ │ Gens │ │ator  │
  └───────┘ └──────┘ └──────┘ └──────┘ └───────┘
```

Key design decisions:

- **Custom agent loop** (no LangChain) for full control over state management and error handling
- **Zod schemas** validate every LLM response — retry on validation failure
- **Parallel generation** — cover letter, bullets, and interview prep run concurrently
- **Self-validation** — the agent checks its own output quality before returning
- **Token tracking** — every run logs token usage and estimated cost

## Quick Start

```bash
# Clone and install
git clone https://github.com/kumarngrjn/jobfit-agent.git
cd jobfit-agent
npm install

# Set up your API key
cp .env.example .env
# Edit .env and add your Anthropic API key

# Build
npm run build

# Run the web UI
npm start
# Open http://localhost:3000

# Or run via CLI
npm run analyze
```

### Mock Mode (no API key needed)

```bash
# Web UI with mock data
npm run start:mock

# CLI with mock data
npm run analyze:mock
```

## Project Structure

```
src/
├── agent/
│   ├── orchestrator.ts     # Main agent loop & state machine driver
│   ├── state.ts            # State types, transitions, PipelineContext
│   └── validator.ts        # Output quality validation
├── tools/
│   ├── jd-parser.ts        # Job description → structured data
│   ├── resume-parser.ts    # Resume → structured data
│   ├── gap-analyzer.ts     # JD + Resume → fit analysis
│   ├── scraper.ts          # URL scraper for job postings (zero deps)
│   └── generators/
│       ├── cover-letter.ts # Tailored cover letter generation
│       ├── resume-bullets.ts # STAR-format bullet points
│       └── interview-prep.ts # Technical & behavioral prep
├── utils/
│   ├── file-parser.ts      # PDF/TXT/MD resume file parser
│   └── cache.ts            # File-based caching with SHA-256 keys
├── llm/
│   ├── client.ts           # Anthropic SDK wrapper with retries & token tracking
│   ├── schemas.ts          # Zod schemas for all structured types
│   ├── prompts.ts          # Prompt templates
│   └── mock-data.ts        # Realistic mock data for offline development
├── server.ts               # HTTP server with multipart upload support
├── run-orchestrator.ts     # CLI entry point for full pipeline
└── index.ts                # Basic pipeline entry point
public/
└── index.html              # React UI (URL input, file upload, CDN-loaded)
tests/
└── fixtures/               # Sample JD and resume for testing
```

## Tech Stack

| Component | Technology | Why |
|---|---|---|
| Language | TypeScript | Type safety for structured LLM outputs |
| Runtime | Node.js 20+ | Built-in HTTP server, no Express needed |
| LLM | Anthropic Claude (Sonnet) | Structured output quality |
| Validation | Zod v4 | Schema validation + documentation |
| Agent | Custom state machine | Full control, no framework overhead |
| UI | React (CDN) | Single-file, zero build step |

## How It Works

The orchestrator drives a **state machine** through 7 states:

1. **INTAKE** — Receive JD text and resume text
2. **PARSE_JD** — LLM extracts structured data (company, skills, responsibilities, red flags)
3. **PARSE_RESUME** — LLM extracts structured data (experience, skills, certifications)
4. **ANALYZE_FIT** — LLM compares JD vs resume, producing a 0-100 score with detailed analysis
5. **GENERATE_OUTPUTS** — Three generators run in parallel (cover letter, bullets, interview prep)
6. **VALIDATE** — Agent self-checks output quality (word count, keyword usage, specificity)
7. **DONE** — Returns all results

If validation fails, the orchestrator loops back to GENERATE_OUTPUTS and only regenerates the failing sections (up to 2 attempts).

## Sample Output

```
📊 Fit Score: 68/100
✅ Strong matches: 5  |  ⚠️ Gaps: 4  |  🎯 Reframe: 3

Generated:
- cover-letter.md      ✓ (263 words, personalized)
- tailored-bullets.md  ✓ (7 STAR-format bullets)
- interview-prep.md    ✓ (4 technical, 4 behavioral, 5 to-ask)

📝 Validation: PASSED (1 attempt)
```

## Roadmap

- [x] Phase 1: Foundation (LLM client, parsers, basic pipeline)
- [x] Phase 2: Agent loop (state machine, generators, validation)
- [x] Phase 3: URL scraping & PDF resume parsing
- [ ] Phase 4: CLI with Commander.js (`jobfit analyze <url> --resume ./resume.pdf`)
- [ ] Phase 5: SQLite storage, application tracking, Next.js dashboard

## License

MIT
