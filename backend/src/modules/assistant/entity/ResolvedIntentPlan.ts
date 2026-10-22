import { ResolvedIntent } from "./ResolvedIntent";
import { ResolvedTarget } from "./ResolvedTarget";
import { ClarificationRequest } from "./ClarificationRequest";

export interface ResolvedIntentPlan {
  requestId: string;
  intents: ResolvedIntent[];
  resolvedTargets: ResolvedTarget[];
  clarificationRequests: ClarificationRequest[];
}
