import { CapabilityRequirement } from "./CapabilityRequirement";
import { IntentType } from "../intent/IntentType";

export interface Capability {
  id: string;
  name: string;
  description: string;
  requirements: CapabilityRequirement[];
  intentType: IntentType;
}
