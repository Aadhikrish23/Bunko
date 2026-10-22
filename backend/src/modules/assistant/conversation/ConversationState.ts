import { ConversationSession } from "./ConversationSession";

export interface ConversationState {
  currentSession: ConversationSession | null;
}
