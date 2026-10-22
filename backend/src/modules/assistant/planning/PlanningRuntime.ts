import { ResolvedCapability } from "./ResolvedCapability";
import { ResolvedIntentPlan } from "../entity/ResolvedIntentPlan";
import { ContextSnapshot } from "../context/ContextSnapshot";
import { PlanningResult } from "./PlanningResult";
import { PlanningRuntimeResult } from "./PlanningRuntimeResult";
import { IntentPlan } from "../intent/IntentPlan";
import { ContextBuilder } from "../context/ContextBuilder";
import capabilityResolver from "./CapabilityResolver";
import contextRequestBuilder from "../context/ContextRequestBuilder";
import entityResolutionLayer from "../entity/EntityResolutionLayer";
import planningEngine from "./PlanningEngine";
import aiTraceLogger from "../debug/AITraceLogger";
import { PlanningRuntimeError } from "../runtime/errors/PlanningRuntimeError";
import { EntityResolutionError } from "../runtime/errors/EntityResolutionError";
import executionHealth from "../execution/ExecutionHealth";
import { ConversationSession } from "../conversation/ConversationSession";

export class PlanningRuntime {
  constructor(private readonly contextBuilder: ContextBuilder) {}

  /**
   * Runs the sequential stages of the planning pipeline.
   * Encapsulates all planning-related trace logging and errors categorization.
   */
  async plan(userId: string, intentPlan: IntentPlan, session: ConversationSession, userQuery?: string): Promise<PlanningRuntimeResult> {
    const trace = aiTraceLogger.current();
    const startTime = Date.now();

    if (trace) {
      trace.log("PlanningRuntime", "Planning Started", { intentPlanId: intentPlan.requestId });
    }

    try {
      
      // Stage 1: Capability Resolution
      const resolvedCapabilities = capabilityResolver.resolve(intentPlan);
      if (trace) {
        trace.log("PlanningRuntime", "Capability Resolution", {
          count: resolvedCapabilities.length,
          capabilities: resolvedCapabilities.map((rc) => rc.capability.id),
        });
      }

      // Stage 2: Context Request Building
      const contextRequest = contextRequestBuilder.build(
        intentPlan.requestId,
        userId,
        resolvedCapabilities
      );
      if (trace) {
        trace.log("PlanningRuntime", "Context Request Built", contextRequest);
      }

      // Stage 3: Context Snapshot Generation
      const contextSnapshot = await this.contextBuilder.build(contextRequest);
      if (trace) {
        trace.log("PlanningRuntime", "Context Snapshot Built", {
          factCategoriesCount: Object.keys(contextSnapshot.facts || {}).length,
        });
      }

      // Stage 4: Entity Resolution
      let resolvedIntentPlan;
      try {
        resolvedIntentPlan = await entityResolutionLayer.resolve(
          intentPlan.requestId,
          userId,
          resolvedCapabilities
        );
      } catch (err: unknown) {
        executionHealth.trackEntityResolutionFailure();
        const errorMsg = err instanceof Error ? err.message : String(err);
        throw new EntityResolutionError(
          `Entity resolution stage failed: ${errorMsg}`,
          "ENTITY_RESOLUTION_FAILED",
          true,
          { userId },
          err
        );
      }

      if (trace) {
        trace.log("PlanningRuntime", "Entity Resolution", {
          resolvedTargetsCount: resolvedIntentPlan.resolvedTargets?.length || 0,
        });
      }

      // Stage 5: Planning Engine Validation
      let planningResult;
      try {
        planningResult = await planningEngine.plan(
          resolvedCapabilities,
          contextSnapshot,
          resolvedIntentPlan,
          session.references,
          userQuery
        );
      } catch (err: unknown) {
        executionHealth.trackPlanningFailure();
        const errorMsg = err instanceof Error ? err.message : String(err);
        throw new PlanningRuntimeError(
          `Planning engine constraint validation failed: ${errorMsg}`,
          "PLANNING_ENGINE_FAILED",
          false,
          {},
          err
        );
      }

      if (trace) {
        const elapsed = Date.now() - startTime;
        trace.log("PlanningRuntime", "Planning Completed", planningResult, elapsed);
      }

      return {
        resolvedCapabilities,
        resolvedIntentPlan,
        contextSnapshot,
        planningResult,
      };
    } catch (err: unknown) {
      if (trace) {
        trace.log("PlanningRuntime", "Planning Failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      throw err;
    }
  }
}

export default PlanningRuntime;
