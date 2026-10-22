import { IntentTarget } from "../intent/IntentTarget";
import { EntityResolutionResult } from "./EntityResolutionResult";

export interface ResolvedTarget<T = unknown> {
  originalTarget: IntentTarget;
  resolution: EntityResolutionResult<T>;
}
