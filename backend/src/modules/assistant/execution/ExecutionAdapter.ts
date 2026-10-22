import { ExecutionPlan } from "./ExecutionPlan";
import toolInputFactory from "./ToolInputFactory";
import { ResolvedIntentPlan } from "../entity/ResolvedIntentPlan";
import { IntentTargetType } from "../intent/IntentTargetType";
import { ResolvedTarget } from "../entity/ResolvedTarget";
import { EntityResolutionResult } from "../entity/EntityResolutionResult";

class ResolvedEntityIndex {
  private readonly index = new Map<string, EntityResolutionResult<unknown>>();

  constructor(resolvedTargets: ResolvedTarget[]) {
    if (resolvedTargets) {
      for (const rt of resolvedTargets) {
        const key = `${rt.originalTarget.type}:${rt.originalTarget.name}`;
        this.index.set(key, rt.resolution);
      }
    }
  }

  get(type: string, name: string): EntityResolutionResult<unknown> | null {
    return this.index.get(`${type}:${name}`) || null;
  }
}

export class ExecutionAdapter {
  /**
   * Adapts modern ExecutionPlan steps to legacy input formats.
   * Pure model adapter with no validation, retries, recovery, or logging.
   */
  async adapt(executionPlan: ExecutionPlan, resolvedIntentPlan: ResolvedIntentPlan) {
    const entityIndex = new ResolvedEntityIndex(resolvedIntentPlan?.resolvedTargets || []);
    const steps = [];

    for (const step of executionPlan.steps) {
      const legacyInput = toolInputFactory.createInput(step);

      if (typeof legacyInput.gameId === "string" && legacyInput.gameId !== "") {
        const resolutionResult = entityIndex.get(IntentTargetType.Game, legacyInput.gameId);
        if (resolutionResult && resolutionResult.entity) {
          const entity = resolutionResult.entity as { _id: { toString(): string } };
          legacyInput.gameId = entity._id.toString();
        }
      }
      steps.push({
        id: step.id,
        tool: step.toolName,
        input: {
          ...legacyInput,
          _capabilityId: step.input.capabilityId,
        },
      });
    }

    return {
      id: executionPlan.id,
      steps,
    };
  }
}

export default new ExecutionAdapter();
