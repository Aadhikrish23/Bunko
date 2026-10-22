import { AsyncLocalStorage } from "async_hooks";
import { AILogWriter } from "./AILogWriter";
import { AILogFormatter } from "./AILogFormatter";
import { LoggingConfig } from "./LoggingConfig";
import { coreLog } from "./coreLog";

export interface LogEvent {
  timestamp: Date;
  layer: string;
  event: string;
  payload: any;
  elapsedMs?: number;
}

export interface ErrorLog {
  timestamp: Date;
  layer: string;
  message: string;
  stack?: string;
  exception: any;
}

export class AILogger {
  private static readonly storage = new AsyncLocalStorage<AILogger>();

  public readonly requestId: string;
  public userId: string = "unknown";
  public sessionId: string = "unknown";
  public originalRequest: string = "unknown";
  public startTime: Date;
  public status: string = "UNKNOWN";

  public events: LogEvent[] = [];
  public errors: ErrorLog[] = [];
  public finalResponse: any = null;
  public stats: any = {};

  constructor(requestId: string) {
    this.requestId = requestId;
    this.startTime = new Date();
  }

  /**
   * Run callback inside the context of a new AILogger instance.
   */
  static run<T>(requestId: string, callback: () => Promise<T>): Promise<T> {
    const loggerInstance = new AILogger(requestId);
    return this.storage.run(loggerInstance, callback);
  }

  /**
   * Get the current active AILogger instance.
   */
  static current(): AILogger | undefined {
    return this.storage.getStore();
  }

  /**
   * Log an event and keep in-memory for formatting.
   */
  log(layer: string, event: string, payload: any, elapsedMs?: number): void {
    const timestamp = new Date();
    this.events.push({
      timestamp,
      layer,
      event,
      payload,
      elapsedMs,
    });

    // Capture Session ID from events if possible
    if (payload && typeof payload === "object") {
      if (payload.sessionId) {
        this.sessionId = payload.sessionId;
      }
    }

    // Keep console trace concise (existing Ollama/request trace is clean)
    if (LoggingConfig.CONSOLE_CONCISE) {
      const timeStr = timestamp.toLocaleTimeString();
      let summary = "";
      if (payload) {
        if (typeof payload === "string") {
          summary = payload;
        } else if (payload.message) {
          summary = payload.message;
        } else if (payload.status) {
          summary = payload.status;
        } else if (payload.toolName) {
          summary = `${payload.toolName} (stepId: ${payload.stepId})`;
        } else {
          // concise keys
          const keys = Object.keys(payload).slice(0, 3);
          summary = keys.map(k => `${k}: ${typeof payload[k] === "object" ? "..." : payload[k]}`).join(", ");
        }
      }
      coreLog.debug(`[AI-Trace] [${timeStr}] [${layer}] ${event}${summary ? ` - ${summary}` : ""}`);
    }
  }

  /**
   * Log an error.
   */
  error(layer: string, exception: any): void {
    const timestamp = new Date();
    const message = exception instanceof Error ? exception.message : String(exception);
    const stack = exception instanceof Error ? exception.stack : undefined;

    this.errors.push({
      timestamp,
      layer,
      message,
      stack,
      exception,
    });

    coreLog.error(`[AI-Trace] [ERROR] [${layer}] ${message}`, stack || "");
  }

  /**
   * Write starting trace metadata.
   */
  writeHeader(userId: string, request: string): void {
    this.userId = userId;
    this.originalRequest = request;
  }

  /**
   * Update stats summary.
   */
  updateStats(stats: any): void {
    this.stats = { ...this.stats, ...stats };
    if (stats.status) {
      this.status = stats.status;
    }
  }

  /**
   * Compile, format and write the trace file.
   */
  end(): void {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const year = now.getFullYear();
    const month = pad(now.getMonth() + 1);
    const date = pad(now.getDate());
    const hours = pad(now.getHours());
    const minutes = pad(now.getMinutes());
    const seconds = pad(now.getSeconds());

    const dateFolder = `${year}-${month}-${date}`;
    const timestampStr = `${year}${month}${date}_${hours}${minutes}${seconds}`;
    const shortUuid = this.requestId.substring(0, 8);

    // Sanitize and limit original request text for filename
    const cleanRequest = this.originalRequest
      .replace(/[^a-zA-Z0-9\s-_]/g, "")
      .trim()
      .replace(/\s+/g, "_");

    const requestSnippet = cleanRequest.substring(0, LoggingConfig.MAX_FILENAME_REQUEST_LENGTH) || "Request";
    const filename = `${timestampStr}_${shortUuid}_${requestSnippet}.log`;

    // Format the log content using AILogFormatter
    const formattedContent = AILogFormatter.format(this);

    // Write to file using AILogWriter
    AILogWriter.writeLog(dateFolder, filename, formattedContent);
  }
}
