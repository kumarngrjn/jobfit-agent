import { writeFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_PREFIX: Record<LogLevel, string> = {
  debug: "🔍",
  info: "ℹ️ ",
  warn: "⚠️ ",
  error: "❌",
};

class Logger {
  private level: LogLevel = "info";
  private logFile: string | null = null;
  private verbose = false;
  private entries: LogEntry[] = [];

  configure(opts: { level?: LogLevel; logFile?: string; verbose?: boolean }) {
    if (opts.level) this.level = opts.level;
    if (opts.logFile) {
      this.logFile = opts.logFile;
      const dir = dirname(opts.logFile);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    }
    if (opts.verbose !== undefined) this.verbose = opts.verbose;
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[this.level];
  }

  private write(level: LogLevel, message: string, context?: Record<string, unknown>) {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(context && { context }),
    };

    this.entries.push(entry);

    // Write to file if configured
    if (this.logFile) {
      appendFileSync(this.logFile, JSON.stringify(entry) + "\n");
    }

    // Write to console if verbose or warn/error
    if (this.verbose || level === "warn" || level === "error") {
      const prefix = LEVEL_PREFIX[level];
      const contextStr = context ? ` ${JSON.stringify(context)}` : "";
      if (level === "error") {
        console.error(`${prefix} ${message}${contextStr}`);
      } else {
        console.log(`${prefix} ${message}${contextStr}`);
      }
    }
  }

  debug(message: string, context?: Record<string, unknown>) {
    this.write("debug", message, context);
  }

  info(message: string, context?: Record<string, unknown>) {
    this.write("info", message, context);
  }

  warn(message: string, context?: Record<string, unknown>) {
    this.write("warn", message, context);
  }

  error(message: string, context?: Record<string, unknown>) {
    this.write("error", message, context);
  }

  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  /** Save all collected entries to a JSON file */
  saveTo(filePath: string) {
    const dir = dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, JSON.stringify(this.entries, null, 2));
  }
}

export const logger = new Logger();
