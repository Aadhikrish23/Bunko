import { PlanningResult } from "../planning/PlanningResult";
import { ExecutionPlan } from "./ExecutionPlan";
import { ExecutionStep } from "./ExecutionStep";
import { ResolvedIntentPlan } from "../entity/ResolvedIntentPlan";
import crypto from "crypto";

export class ExecutionPlanner {
  /**
   * Translates a PlanningResult into an abstract deterministic ExecutionPlan.
   * Pure translator: no validations, mapping, or runtime decisions.
   */
  plan(planningResult: PlanningResult, resolvedIntentPlan: ResolvedIntentPlan): ExecutionPlan {
    const steps: ExecutionStep[] = [];

    if (planningResult.executionCandidates) {
      for (const candidate of planningResult.executionCandidates) {
        steps.push({
          id: crypto.randomUUID(),
          toolName: "", // ToolName is resolved during prepare stage in execution pipeline
          input: {
            targets: candidate.targets,
            parameters: candidate.parameters,
            capabilityId: candidate.capability.id,
          },
        });
      }
    }

    return {
      id: crypto.randomUUID(),
      steps,
    };
  }
}

export default new ExecutionPlanner();
