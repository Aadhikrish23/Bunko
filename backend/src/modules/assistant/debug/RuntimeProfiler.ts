import aiTraceLogger from "./AITraceLogger";

export interface ProfileMetrics {
  planningDurationMs?: number;
  executionDurationMs?: number;
  conversationDurationMs?: number;
  memoryDurationMs?: number;
  clarificationDurationMs?: number;
  entityResolutionDurationMs?: number;
  toolDurationsMs: Record<string, number>;
  overallRuntimeMs?: number;
}

export class RuntimeProfiler {
  private readonly metrics: ProfileMetrics = {
    toolDurationsMs: {},
  };
  private overallStartTime = 0;
  private readonly layerStartTimes: Record<string, number> = {};

  /**
   * Begins overall workflow profiling.
   */
  startOverall(): void {
    this.overallStartTime = Date.now();
  }

  /**
   * Finalizes overall workflow profiling and records results into trace logger.
   */
  stopOverall(): void {
    if (this.overallStartTime > 0) {
      this.metrics.overallRuntimeMs = Date.now() - this.overallStartTime;
      const trace = aiTraceLogger.current();
      if (trace) {
        trace.log("RuntimeProfiler", "Profiler Metrics Captured", this.metrics);
      }
    }
  }

  /**
   * Starts timing a specific processing layer.
   */
  startLayer(layer: string): void {
    this.layerStartTimes[layer] = Date.now();
  }

  /**
   * Stops timing a specific processing layer.
   */
  stopLayer(layer: string): void {
    const start = this.layerStartTimes[layer];
    if (start) {
      const duration = Date.now() - start;
      if (layer === "planning") this.metrics.planningDurationMs = duration;
      else if (layer === "execution") this.metrics.executionDurationMs = duration;
      else if (layer === "conversation") this.metrics.conversationDurationMs = duration;
      else if (layer === "memory") this.metrics.memoryDurationMs = duration;
      else if (layer === "clarification") this.metrics.clarificationDurationMs = duration;
      else if (layer === "entity") this.metrics.entityResolutionDurationMs = duration;
    }
  }

  /**
   * Logs duration for an individual tool run.
   */
  recordToolDuration(tool: string, durationMs: number): void {
    this.metrics.toolDurationsMs[tool] = (this.metrics.toolDurationsMs[tool] || 0) + durationMs;
  }

  /**
   * Returns current profiler metrics.
   */
  getMetrics(): ProfileMetrics {
    return this.metrics;
  }
}
export default RuntimeProfiler;
