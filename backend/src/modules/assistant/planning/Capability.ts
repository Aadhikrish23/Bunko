import { CapabilityRequirement } from "./CapabilityRequirement";
import { IntentType } from "../intent/IntentType";

export interface Capability {
  id: string;
  name: string;
  description: string;
  requirements: CapabilityRequirement[];
  intentType: IntentType;
  /**
   * Other intents this capability also handles (a review capability that also rates and
   * deletes reviews). Optional; most capabilities serve only intentType.
   */
  extraIntentTypes?: IntentType[];
}
