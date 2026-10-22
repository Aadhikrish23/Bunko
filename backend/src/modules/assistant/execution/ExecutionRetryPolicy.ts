export class ExecutionRetryPolicy {
  readonly MAX_RETRIES = 3;

  /**
   * Evaluates if a given error should be retried based on failure classification.
   */
  isRetryable(error: Error | string | any): boolean {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const lowercaseMsg = errorMsg.toLowerCase();

    // 1. Explicitly non-retryable deterministic errors
    const nonRetryablePatterns = [
      "validation failed",
      "not registered",
      "missing required",
      "invalid parameter",
      "type mismatch",
      "not found",
      "duplicate step",
      "ambiguous game",
    ];

    if (nonRetryablePatterns.some((pat) => lowercaseMsg.includes(pat))) {
      return false;
    }

    // 2. Retryable network/transient/timeout errors
    const retryablePatterns = [
      "timeout",
      "temporary",
      "network",
      "unavailable",
      "busy",
      "rate limit",
      "socket",
      "connection",
    ];

    if (retryablePatterns.some((pat) => lowercaseMsg.includes(pat))) {
      return true;
    }

    // Default to false for unknown deterministic errors to avoid infinite loops
    return false;
  }
}

export default new ExecutionRetryPolicy();
