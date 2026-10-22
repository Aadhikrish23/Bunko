import { ConversationSession } from "./ConversationSession";
import { ConversationContext } from "./ConversationContext";

export class ConversationContextBuilder {
  build(session: ConversationSession): ConversationContext {
    return {
      session,
      references: session.references,
      recentTurns: session.turns,
      pendingClarification: session.pendingClarification,
      conversationStatus: session.status,
    };
  }
}

export default new ConversationContextBuilder();
