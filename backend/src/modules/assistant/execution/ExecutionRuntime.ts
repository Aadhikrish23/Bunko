import { PlanningResult } from "../planning/PlanningResult";
import { ResolvedIntentPlan } from "../entity/ResolvedIntentPlan";
import { AIToolContext } from "../sdk/AIToolContext";
import { ConversationSession } from "../conversation/ConversationSession";
import { MemoryContext } from "../memory/MemoryContext";
import { ExecutionResult } from "./ExecutionResult";
import { ExecutionContext } from "./ExecutionContext";
import { ExecutionPipeline } from "./ExecutionPipeline";
import executionPlanner from "./ExecutionPlanner";
import { AIToolRegistry } from "../sdk/AIToolRegistry";
import { AIExecutor } from "../sdk/AIExecutor";
import aiTraceLogger from "../debug/AITraceLogger";
import { ExecutionRuntimeError } from "../runtime/errors/ExecutionRuntimeError";
import executionHealth from "./ExecutionHealth";
import crypto from "crypto";

export class ExecutionRuntime {
  private readonly pipeline: ExecutionPipeline;

  constructor(
    private readonly registry: AIToolRegistry,
    private readonly executor: AIExecutor
  ) {
    this.pipeline = new ExecutionPipeline(this.registry, this.executor);
  }

  /**
   * Coordinates execution, validation, parameters/dependency resolutions, sequential pipelines, and trace logs.
   */
  async execute(
    planningResult: PlanningResult,
    resolvedIntentPlan: ResolvedIntentPlan,
    userId: string,
    requestId: string,
    toolContext: AIToolContext,
    session: ConversationSession,
    memoryContext?: MemoryContext,
    userQuery?: string
  ): Promise<ExecutionResult> {
    const trace = aiTraceLogger.current();
    if (trace) {
      trace.log("ExecutionRuntime", "Execution Started", { userId, requestId });
    }

    try {
      const executionPlan = executionPlanner.plan(planningResult, resolvedIntentPlan);

      const context: ExecutionContext = {
        requestId,
        userId,
        executionId: crypto.randomUUID(),
        conversationId: session.sessionId,
        memoryContext,
        planningResult,
        resolvedIntentPlan,
        executionPlan,
        runtimeMetadata: {},
        traceMetadata: {},
      };

      const result = await this.pipeline.run(context, toolContext, userQuery);

      if (trace) {
        if (result.status === "FAILED") {
          trace.log("ExecutionRuntime", "Execution Failed", { errors: result.errors });
        } else {
          trace.log("ExecutionRuntime", "Execution Completed", { status: result.status });
        }
      }

      return result;
    } catch (err: unknown) {
      executionHealth.trackExecutionFailure();
      const errorObj = err as Error;
      if (trace) {
        trace.log("ExecutionRuntime", "Execution Failed", { error: errorObj.message || String(err) });
      }
      if (err instanceof ExecutionRuntimeError) {
        throw err;
      }
      throw new ExecutionRuntimeError(errorObj.message || String(err), "EXECUTION_FAILED", false, {}, err);
    }
  }
}
export default ExecutionRuntime;
