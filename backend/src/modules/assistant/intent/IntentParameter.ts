import { IntentParameterType } from "./IntentParameterType";

export interface IntentParameter {
  type: IntentParameterType;
  value: string | number | boolean;
}
