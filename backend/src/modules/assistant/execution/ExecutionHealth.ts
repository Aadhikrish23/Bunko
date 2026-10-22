import { ExecutionResult } from "./ExecutionResult";

export interface ExecutionHealthMetrics {
  readonly averageLatencyMs: number;
  readonly toolSuccessRate: number;
  readonly toolFailureRate: number;
  readonly clarificationRate: number;
  readonly totalRetryCount: number;
  readonly entityResolutionFailuresCount: number;
  readonly planningFailuresCount: number;
  readonly executionFailuresCount: number;
  readonly totalExecutionDurationMs: number;
}

export class ExecutionHealth {
  private totalExecutionsCount = 0;
  private totalClarificationsCount = 0;
  private totalStepsCount = 0;
  private totalSucceededSteps = 0;
  private totalFailedSteps = 0;
  private totalRetryCount = 0;
  private totalLatencyMs = 0;
  private entityResolutionFailuresCount = 0;
  private planningFailuresCount = 0;
  private executionFailuresCount = 0;

  /**
   * Tracks execution telemetry from finished results.
   */
  track(result: ExecutionResult, totalDurationMs: number, clarificationTriggered: boolean): void {
    this.totalExecutionsCount += 1;
    this.totalLatencyMs += totalDurationMs;
    if (clarificationTriggered) {
      this.totalClarificationsCount += 1;
    }

    if (result.status === "FAILED") {
      this.executionFailuresCount += 1;
    }

    for (const step of result.steps) {
      this.totalStepsCount += 1;
      this.totalRetryCount += step.retryCount;
      if (step.status === "SUCCESS") {
        this.totalSucceededSteps += 1;
      } else {
        this.totalFailedSteps += 1;
      }
    }
  }

  trackEntityResolutionFailure(): void {
    this.entityResolutionFailuresCount += 1;
  }

  trackPlanningFailure(): void {
    this.planningFailuresCount += 1;
  }

  trackExecutionFailure(): void {
    this.executionFailuresCount += 1;
  }

  /**
   * Returns aggregated dashboard-ready metrics.
   */
  getMetrics(): ExecutionHealthMetrics {
    const successRate = this.totalStepsCount > 0 ? this.totalSucceededSteps / this.totalStepsCount : 1;
    const failureRate = this.totalStepsCount > 0 ? this.totalFailedSteps / this.totalStepsCount : 0;
    const averageLatencyMs = this.totalExecutionsCount > 0 ? this.totalLatencyMs / this.totalExecutionsCount : 0;
    const clarificationRate = this.totalExecutionsCount > 0 ? this.totalClarificationsCount / this.totalExecutionsCount : 0;

    return {
      averageLatencyMs,
      toolSuccessRate: successRate,
      toolFailureRate: failureRate,
      clarificationRate,
      totalRetryCount: this.totalRetryCount,
      entityResolutionFailuresCount: this.entityResolutionFailuresCount,
      planningFailuresCount: this.planningFailuresCount,
      executionFailuresCount: this.executionFailuresCount,
      totalExecutionDurationMs: this.totalLatencyMs,
    };
  }
}

export default new ExecutionHealth();
