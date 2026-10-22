import { ConversationSession } from "./ConversationSession";
import { ConversationReferences } from "./ConversationReferences";
import { ConversationTurn } from "./ConversationTurn";
import { ConversationStatus } from "./ConversationStatus";
import { ClarificationRequest } from "../entity/ClarificationRequest";

export interface ConversationContext {
  session: ConversationSession;
  references: ConversationReferences;
  recentTurns: ConversationTurn[];
  pendingClarification?: ClarificationRequest | null;
  conversationStatus: ConversationStatus;
}
