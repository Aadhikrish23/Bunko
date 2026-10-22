import { IntentType } from "../intent/IntentType";
import { IntentParameter } from "../intent/IntentParameter";
import { IntentTarget } from "../intent/IntentTarget";
import { ResolvedTarget } from "./ResolvedTarget";

export interface ResolvedIntent {
  type: IntentType;
  confidence: number;
  originalTargets: IntentTarget[];
  resolvedTargets: ResolvedTarget[];
  parameters: IntentParameter[];
}
