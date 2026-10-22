import { IntentType } from "./IntentType";
import { IntentTarget } from "./IntentTarget";
import { IntentParameter } from "./IntentParameter";

export interface AIIntent {
  type: IntentType;
  confidence: number;
  targets: IntentTarget[];
  parameters: IntentParameter[];
}
