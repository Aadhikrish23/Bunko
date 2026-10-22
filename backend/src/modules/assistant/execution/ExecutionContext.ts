import { PlanningResult } from "../planning/PlanningResult";
import { ResolvedIntentPlan } from "../entity/ResolvedIntentPlan";
import { ExecutionPlan } from "./ExecutionPlan";
import { MemoryContext } from "../memory/MemoryContext";

export interface ExecutionContext {
  readonly requestId: string;
  readonly userId: string;
  readonly executionId: string;
  readonly conversationId: string;
  readonly memoryContext?: MemoryContext;
  readonly planningResult: PlanningResult;
  readonly resolvedIntentPlan: ResolvedIntentPlan;
  readonly executionPlan: ExecutionPlan;
  readonly runtimeMetadata: Record<string, unknown>;
  readonly traceMetadata: Record<string, unknown>;
}

/**
 * Helper to non-mutably update execution context metadata.
 */
export function withMetadata(
  context: ExecutionContext,
  runtimeMetadata: Record<string, unknown>
): ExecutionContext {
  return {
    ...context,
    runtimeMetadata: { ...context.runtimeMetadata, ...runtimeMetadata },
  };
}
