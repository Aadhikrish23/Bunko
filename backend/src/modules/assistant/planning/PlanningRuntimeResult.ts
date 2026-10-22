import { ResolvedCapability } from "./ResolvedCapability";
import { ResolvedIntentPlan } from "../entity/ResolvedIntentPlan";
import { ContextSnapshot } from "../context/ContextSnapshot";
import { PlanningResult } from "./PlanningResult";

export interface PlanningRuntimeResult {
  readonly resolvedCapabilities: ResolvedCapability[];
  readonly resolvedIntentPlan: ResolvedIntentPlan;
  readonly contextSnapshot: ContextSnapshot;
  readonly planningResult: PlanningResult;
}
