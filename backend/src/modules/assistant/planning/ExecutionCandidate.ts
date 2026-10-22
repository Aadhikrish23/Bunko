import { Capability } from "./Capability";
import { IntentTarget } from "../intent/IntentTarget";
import { IntentParameter } from "../intent/IntentParameter";

export interface ExecutionCandidate {
  capability: Capability;
  targets: IntentTarget[];
  parameters: IntentParameter[];
}
