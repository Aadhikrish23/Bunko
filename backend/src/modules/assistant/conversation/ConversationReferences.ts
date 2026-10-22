import { ConversationReference } from "./ConversationReference";

export interface ConversationReferences {
  currentGame?: ConversationReference | null;
  currentCollection?: ConversationReference | null;
  currentProvider?: ConversationReference | null;
  lastEntity?: ConversationReference | null;
  lastIntent?: string | null;
  pendingEntity?: ConversationReference | null;
  // Allow for future extension points
  [key: string]: ConversationReference | string | null | undefined;
}
