import { ConversationSession } from "./ConversationSession";
import { ConversationTurn } from "./ConversationTurn";
import { ConversationRuntimeConfig } from "./ConversationRuntimeConfig";

export class ConversationTurnManager {
  /**
   * Appends a completed turn to session history, trimming if it exceeds threshold limit.
   */
  appendTurn(session: ConversationSession, turn: ConversationTurn): void {
    session.turns.push(turn);
    session.updatedAt = new Date();
    session.expiresAt = new Date(Date.now() + ConversationRuntimeConfig.SESSION_TIMEOUT_MS);

    const maxHistory = ConversationRuntimeConfig.MAX_TURNS;
    if (session.turns.length > maxHistory) {
      session.turns = session.turns.slice(session.turns.length - maxHistory);
    }
  }

  /**
   * Generates a brief summary of the conversation turn history.
   */
  summarize(session: ConversationSession): string {
    if (session.turns.length === 0) return "No prior history.";
    return session.turns
      .map((t) => `User: ${t.userMessage} -> Assistant: ${t.summary || ""}`)
      .join("\n");
  }
}

export default new ConversationTurnManager();
