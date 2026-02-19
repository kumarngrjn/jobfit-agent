import type { ParsedJD, ParsedResume, FitAnalysis } from "../llm/schemas.js";

// --- Agent States ---

export enum AgentState {
  INTAKE = "INTAKE",
  PARSE_JD = "PARSE_JD",
  PARSE_RESUME = "PARSE_RESUME",
  ANALYZE_FIT = "ANALYZE_FIT",
  GENERATE_OUTPUTS = "GENERATE_OUTPUTS",
  VALIDATE = "VALIDATE",
  DONE = "DONE",
  ERROR = "ERROR",
}

// --- Generated Outputs ---

export interface GeneratedOutputs {
  coverLetter: string | null;
  tailoredBullets: string | null;
  interviewPrep: string | null;
}

// --- Validation Result ---

export interface ValidationResult {
  passed: boolean;
  coverLetterValid: boolean;
  bulletsValid: boolean;
  interviewPrepValid: boolean;
  issues: string[];
}

// --- Pipeline Context (full state of a run) ---

export interface PipelineContext {
  // Inputs
  jdText: string;
  resumeText: string;

  // Parsed data
  parsedJD: ParsedJD | null;
  parsedResume: ParsedResume | null;
  fitAnalysis: FitAnalysis | null;

  // Generated outputs
  outputs: GeneratedOutputs;

  // Validation
  validation: ValidationResult | null;
  validationAttempts: number;

  // Agent state
  currentState: AgentState;
  stateHistory: { state: AgentState; timestamp: number; durationMs?: number }[];

  // Metadata
  errors: string[];
  startTime: number;
  tokenUsage: { inputTokens: number; outputTokens: number };
}

// --- Factory ---

export function createPipelineContext(
  jdText: string,
  resumeText: string
): PipelineContext {
  return {
    jdText,
    resumeText,
    parsedJD: null,
    parsedResume: null,
    fitAnalysis: null,
    outputs: {
      coverLetter: null,
      tailoredBullets: null,
      interviewPrep: null,
    },
    validation: null,
    validationAttempts: 0,
    currentState: AgentState.INTAKE,
    stateHistory: [{ state: AgentState.INTAKE, timestamp: Date.now() }],
    errors: [],
    startTime: Date.now(),
    tokenUsage: { inputTokens: 0, outputTokens: 0 },
  };
}

// --- Helpers ---

export function transitionTo(ctx: PipelineContext, next: AgentState): void {
  // Record duration on the previous state entry
  const lastEntry = ctx.stateHistory[ctx.stateHistory.length - 1];
  if (lastEntry && !lastEntry.durationMs) {
    lastEntry.durationMs = Date.now() - lastEntry.timestamp;
  }

  ctx.stateHistory.push({ state: next, timestamp: Date.now() });
  ctx.currentState = next;
}

export function addTokenUsage(
  ctx: PipelineContext,
  input: number,
  output: number
): void {
  ctx.tokenUsage.inputTokens += input;
  ctx.tokenUsage.outputTokens += output;
}
