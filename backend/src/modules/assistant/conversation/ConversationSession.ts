import { ConversationStatus } from "./ConversationStatus";
import { ConversationTurn } from "./ConversationTurn";
import { ConversationReferences } from "./ConversationReferences";
import { ClarificationRequest } from "../entity/ClarificationRequest";
import { PendingConversationState } from "./PendingConversationState";

export interface ConversationSession {
  sessionId: string;
  userId: string;
  status: ConversationStatus;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  turns: ConversationTurn[];
  references: ConversationReferences;
  pendingClarification?: ClarificationRequest | null;
  pendingState?: PendingConversationState | null;
  metadata: Record<string, unknown>;
}
