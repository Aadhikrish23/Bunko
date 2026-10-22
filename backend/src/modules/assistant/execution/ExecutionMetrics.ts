import { ExecutionStepResult } from "./ExecutionStepResult";

export interface ExecutionMetricsData {
  readonly totalDurationMs: number;
  readonly averageStepDurationMs: number;
  readonly totalRetryCount: number;
  readonly failedStepsCount: number;
  readonly successfulStepsCount: number;
}

export class ExecutionMetrics {
  /**
   * Evaluates aggregated metrics from step results.
   */
  calculate(stepResults: ExecutionStepResult[], totalDurationMs: number): ExecutionMetricsData {
    let totalRetryCount = 0;
    let failedStepsCount = 0;
    let successfulStepsCount = 0;

    for (const r of stepResults) {
      totalRetryCount += r.retryCount;
      if (r.status === "SUCCESS") {
        successfulStepsCount += 1;
      } else if (r.status === "FAILED") {
        failedStepsCount += 1;
      }
    }

    const averageStepDurationMs = stepResults.length > 0 ? totalDurationMs / stepResults.length : 0;

    return {
      totalDurationMs,
      averageStepDurationMs,
      totalRetryCount,
      failedStepsCount,
      successfulStepsCount,
    };
  }
}

export default new ExecutionMetrics();
