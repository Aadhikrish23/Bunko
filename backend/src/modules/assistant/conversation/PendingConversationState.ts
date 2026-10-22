import { IntentPlan } from "../intent/IntentPlan";
import { ClarificationRequest } from "../entity/ClarificationRequest";

export interface PendingConversationState {
  pendingIntentPlan?: IntentPlan | null;
  clarificationRequest?: ClarificationRequest | null;
  retryCount?: number;
  clarificationCreatedAt?: Date;
}
