import { AILogger } from "../logging/AILogger";

export class AITraceLogger {
  private constructor(private readonly loggerInstance: AILogger) {}

  /**
   * Starts a request-scoped trace session and executes the callback within its context.
   */
  static run<T>(requestId: string, callback: () => Promise<T>): Promise<T> {
    return AILogger.run(requestId, callback);
  }

  /**
   * Retrieves the current request's trace logger instance.
   */
  static current(): AITraceLogger | undefined {
    const logger = AILogger.current();
    if (!logger) return undefined;
    return new AITraceLogger(logger);
  }

  /**
   * Updates trace summary statistics.
   */
  updateStats(stats: Partial<{
    user: string;
    request: string;
    status: string;
    intentCount: number;
    resolvedCapabilities: string[];
    contextCategories: string[];
    executionStepsCount: number;
  }>): void {
    this.loggerInstance.updateStats(stats);
  }

  /**
   * Writes the starting trace header.
   */
  writeHeader(userId: string, request: string): void {
    this.loggerInstance.writeHeader(userId, request);
  }

  /**
   * Logs a successful operation event.
   */
  log(layer: string, event: string, payload: unknown, elapsedMs?: number): void {
    this.loggerInstance.log(layer, event, payload, elapsedMs);
  }

  /**
   * Logs a layer exception event.
   */
  error(layer: string, exception: any): void {
    this.loggerInstance.error(layer, exception);
  }

  /**
   * Closes/ends the trace and writes the summary.
   */
  end(): void {
    this.loggerInstance.end();
  }
}

export default AITraceLogger;
