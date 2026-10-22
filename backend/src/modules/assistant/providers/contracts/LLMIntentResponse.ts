import { IntentType } from "../../intent/IntentType";
import { IntentTargetType } from "../../intent/IntentTargetType";
import { IntentParameterType } from "../../intent/IntentParameterType";

export interface LLMIntentTarget {
  type: IntentTargetType;
  name: string;
}

export interface LLMIntentParameter {
  type: IntentParameterType;
  value: string | number | boolean;
}

export interface LLMIntent {
  type: IntentType;
  targets: LLMIntentTarget[];
  parameters: LLMIntentParameter[];
}

export interface LLMIntentResponse {
  intents: LLMIntent[];
}
