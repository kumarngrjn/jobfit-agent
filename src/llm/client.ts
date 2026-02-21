import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "../../.env"), override: true });

// --- Types ---

export interface LLMCallResult<T> {
  data: T;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  model: string;
  durationMs: number;
}

export interface LLMClientConfig {
  model?: string;
  maxRetries?: number;
  baseDelayMs?: number;
  maxTokens?: number;
}

// --- Token Tracking ---

export interface TokenUsageSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCalls: number;
  estimatedCost: number;
}

// --- Sleep with jitter ---

function sleepWithJitter(baseMs: number, attempt: number): Promise<void> {
  const delay = baseMs * Math.pow(2, attempt) + Math.random() * 1000;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

// --- LLM Client ---

export class LLMClient {
  private client: Anthropic | null;
  private model: string;
  private maxRetries: number;
  private baseDelayMs: number;
  private maxTokens: number;
  private mockMode: boolean;
  private usageLog: { inputTokens: number; outputTokens: number }[] = [];

  constructor(config: LLMClientConfig = {}) {
    this.mockMode = process.env.MOCK_LLM === "true";
    this.model = config.model ?? "claude-sonnet-4-5-20250929";
    this.maxRetries = config.maxRetries ?? 3;
    this.baseDelayMs = config.baseDelayMs ?? 1000;
    this.maxTokens = config.maxTokens ?? 4096;

    if (this.mockMode) {
      console.log("  ⚙ Running in MOCK mode (no API calls)");
      this.client = null;
      return;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Add it to your .env file or set MOCK_LLM=true."
      );
    }

    this.client = new Anthropic({ apiKey });
  }

  /**
   * Send a prompt and parse the response into a validated Zod schema.
   * Retries on both API errors and validation failures.
   */
  async structured<T extends z.ZodType>(
    prompt: string,
    schema: T,
    systemPrompt?: string,
    mockData?: z.infer<T>
  ): Promise<LLMCallResult<z.infer<T>>> {
    // Mock mode — return provided mock data validated against the schema
    if (this.mockMode && mockData) {
      const validated = schema.parse(mockData);
      return {
        data: validated,
        usage: { inputTokens: 0, outputTokens: 0 },
        model: this.model + " (mock)",
        durationMs: 5,
      };
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        console.log(`  ↻ Retry attempt ${attempt}/${this.maxRetries}...`);
        await sleepWithJitter(this.baseDelayMs, attempt);
      }

      const startTime = Date.now();

      try {
        const response = await this.client!.messages.create({
          model: this.model,
          max_tokens: this.maxTokens,
          system: systemPrompt ?? "You are a helpful assistant that always responds with valid JSON matching the requested schema. Do not include any text outside the JSON object.",
          messages: [{ role: "user", content: prompt }],
        });

        const durationMs = Date.now() - startTime;
        const usage = {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        };
        this.usageLog.push(usage);

        // Extract text content
        const textBlock = response.content.find((b) => b.type === "text");
        if (!textBlock || textBlock.type !== "text") {
          throw new Error("No text content in LLM response");
        }

        // Parse JSON from response (handle markdown code blocks)
        let jsonStr = textBlock.text.trim();
        if (jsonStr.startsWith("```")) {
          jsonStr = jsonStr
            .replace(/^```(?:json)?\n?/, "")
            .replace(/\n?```$/, "");
        }

        const parsed = JSON.parse(jsonStr);
        const validated = schema.parse(parsed);

        return {
          data: validated,
          usage,
          model: this.model,
          durationMs,
        };
      } catch (error: any) {
        lastError = error;

        // Don't retry on auth errors
        if (error?.status === 401) {
          throw new Error("Invalid API key. Check your ANTHROPIC_API_KEY.");
        }

        // Don't retry on validation errors past second attempt
        if (error instanceof z.ZodError && attempt >= 2) {
          const issues = (error as any).issues ?? [];
          throw new Error(
            `Schema validation failed after retries: ${issues.map((e: any) => `${e.path?.join(".") ?? ""}: ${e.message}`).join(", ")}`
          );
        }

        console.error(
          `  ✗ Attempt ${attempt + 1} failed: ${error.message?.slice(0, 100)}`
        );
      }
    }

    throw lastError ?? new Error("All retry attempts exhausted");
  }

  /**
   * Simple text completion without structured output.
   */
  async complete(
    prompt: string,
    systemPrompt?: string
  ): Promise<LLMCallResult<string>> {
    const startTime = Date.now();

    const response = await this.client!.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: systemPrompt ?? "You are a helpful assistant.",
      messages: [{ role: "user", content: prompt }],
    });

    const durationMs = Date.now() - startTime;
    const usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
    this.usageLog.push(usage);

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text content in LLM response");
    }

    return {
      data: textBlock.text,
      usage,
      model: this.model,
      durationMs,
    };
  }

  getUsageSummary(): TokenUsageSummary {
    const summary = this.usageLog.reduce(
      (acc, entry) => ({
        totalInputTokens: acc.totalInputTokens + entry.inputTokens,
        totalOutputTokens: acc.totalOutputTokens + entry.outputTokens,
        totalCalls: acc.totalCalls + 1,
        estimatedCost: 0,
      }),
      { totalInputTokens: 0, totalOutputTokens: 0, totalCalls: 0, estimatedCost: 0 }
    );

    // Approximate pricing for Claude Sonnet (per million tokens)
    const inputCostPerM = 3.0;
    const outputCostPerM = 15.0;
    summary.estimatedCost =
      (summary.totalInputTokens / 1_000_000) * inputCostPerM +
      (summary.totalOutputTokens / 1_000_000) * outputCostPerM;

    return summary;
  }
}
