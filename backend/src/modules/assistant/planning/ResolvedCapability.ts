import { Capability } from "./Capability";
import { AIIntent } from "../intent/AIIntent";

export interface ResolvedCapability {
  capability: Capability;
  intent: AIIntent;
  confidence: number;
}
