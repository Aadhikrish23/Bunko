import { ConversationSession } from "./ConversationSession";
import { ConversationStatus } from "./ConversationStatus";
import crypto from "crypto";

export class SessionLifecycleManager {
  /**
   * Creates a new conversation session.
   */
  createSession(userId: string): ConversationSession {
    return {
      sessionId: crypto.randomUUID(),
      userId,
      status: ConversationStatus.ACTIVE,
      turns: [],
      references: {
        currentGame: null,
        lastEntity: null,
        pendingEntity: null,
        currentCollection: null,
        currentProvider: null,
      },
      pendingClarification: null,
      pendingState: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 1800000), // 30 minutes inactivity timeout
      metadata: {},
    };
  }

  /**
   * Evaluates and returns if a session has expired.
   */
  isExpired(session: ConversationSession, maxInactivityMs: number): boolean {
    const elapsed = Date.now() - new Date(session.updatedAt).getTime();
    return elapsed > maxInactivityMs;
  }

  /**
   * Resets an expired session back to a fresh active state, clearing stale
   * turn history and entity references so they don't leak into the new session.
   */
  closeSession(session: ConversationSession): void {
    session.status = ConversationStatus.ACTIVE;
    session.turns = [];
    session.references = {
      currentGame: null,
      lastEntity: null,
      pendingEntity: null,
      currentCollection: null,
      currentProvider: null,
    };
    session.pendingClarification = null;
    session.pendingState = null;
    session.updatedAt = new Date();
  }
}

export default new SessionLifecycleManager();
