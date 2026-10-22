import { ConversationSession } from "./ConversationSession";
import { ConversationTurn } from "./ConversationTurn";
import { ConversationStatus } from "./ConversationStatus";
import { ResolvedIntentPlan } from "../entity/ResolvedIntentPlan";
import { IntentPlan } from "../intent/IntentPlan";
import { ClarificationRequest } from "../entity/ClarificationRequest";
import { ClarificationOption } from "../entity/ClarificationOption";
import conversationStore from "./ConversationStore";
import sessionLifecycleManager from "./SessionLifecycleManager";
import conversationTurnManager from "./ConversationTurnManager";
import conversationReferenceManager from "./ConversationReferenceManager";
import pronounResolver from "./PronounResolver";
import clarificationResolver from "./ClarificationResolver";
import aiTraceLogger from "../debug/AITraceLogger";
import { ConversationRuntimeConfig } from "./ConversationRuntimeConfig";

export class ConversationManager {
  /**
   * Loads or creates session for the user. Expirations are resolved automatically.
   */
  async getOrCreateSession(userId: string): Promise<ConversationSession> {
    const trace = aiTraceLogger.current();
    let session = await conversationStore.get(userId);

    if (session) {
      const expired = sessionLifecycleManager.isExpired(session, ConversationRuntimeConfig.SESSION_TIMEOUT_MS);
      if (expired) {
        sessionLifecycleManager.closeSession(session);
        await conversationStore.save(session);
        if (trace) {
          trace.log("ConversationRuntime", "Session Expired", { sessionId: session.sessionId });
        }
      }
    } else {
      session = sessionLifecycleManager.createSession(userId);
      await conversationStore.create(userId, session);
      if (trace) {
        trace.log("ConversationRuntime", "Session Created", { sessionId: session.sessionId, userId });
      }
    }

    return session;
  }

  /**
   * Saves the session state to the store.
   */
  async saveSession(session: ConversationSession): Promise<void> {
    await conversationStore.save(session);
  }

  /**
   * Appends a completed turn to session history and saves the session.
   */
  async appendTurn(userId: string, turn: ConversationTurn): Promise<void> {
    const session = await conversationStore.get(userId);
    if (!session) return;

    conversationTurnManager.appendTurn(session, turn);
    await conversationStore.save(session);

    const trace = aiTraceLogger.current();
    if (trace) {
      trace.log("ConversationRuntime", "Conversation Updated", {
        sessionId: session.sessionId,
        userId,
        turnsCount: session.turns.length,
      });
      trace.log("ConversationRuntime", "Session Saved", {
        sessionId: session.sessionId,
        userId,
      });
    }
  }

  /**
   * Increments retry count for clarification.
   */
  async incrementClarificationRetry(userId: string): Promise<number> {
    const session = await conversationStore.get(userId);
    if (!session) return 0;

    const count = (session.pendingState?.retryCount || 0) + 1;
    if (session.pendingState) {
      session.pendingState.retryCount = count;
    }
    session.updatedAt = new Date();
    await conversationStore.save(session);
    return count;
  }

  /**
   * Stores the pending plan and clarification details.
   */
  async markClarificationCreated(
    userId: string,
    clarificationRequest: ClarificationRequest,
    originalIntentPlan: IntentPlan
  ): Promise<void> {
    const session = await conversationStore.get(userId);
    if (!session) return;

    session.status = ConversationStatus.WAITING_FOR_CLARIFICATION;
    session.pendingClarification = clarificationRequest;
    session.pendingState = {
      pendingIntentPlan: originalIntentPlan,
      clarificationRequest,
      retryCount: 0,
      clarificationCreatedAt: new Date(),
    };
    session.updatedAt = new Date();
    await conversationStore.save(session);

    const trace = aiTraceLogger.current();
    if (trace) {
      trace.log("ConversationRuntime", "Clarification Stored", {
        sessionId: session.sessionId,
        clarificationRequestId: clarificationRequest.id,
      });
    }
  }

  /**
   * Updates pending conversation state.
   */
  async updatePendingState(
    userId: string,
    pendingIntentPlan: IntentPlan | null,
    clarificationRequest: ClarificationRequest | null
  ): Promise<void> {
    const session = await conversationStore.get(userId);
    if (!session) return;

    if (session.pendingState) {
      session.pendingState.pendingIntentPlan = pendingIntentPlan;
      session.pendingState.clarificationRequest = clarificationRequest;
    } else {
      session.pendingState = {
        pendingIntentPlan,
        clarificationRequest,
      };
    }
    session.updatedAt = new Date();
    await conversationStore.save(session);
  }

  /**
   * Clears the pending clarification and plans.
   */
  async clearPendingState(userId: string): Promise<void> {
    const session = await conversationStore.get(userId);
    if (!session) return;

    session.status = ConversationStatus.ACTIVE;
    session.pendingClarification = null;
    session.pendingState = null;
    session.updatedAt = new Date();
    await conversationStore.save(session);

    const trace = aiTraceLogger.current();
    if (trace) {
      trace.log("ConversationRuntime", "Session Saved", {
        sessionId: session.sessionId,
        userId,
      });
    }
  }

  /**
   * Updates the active active session timestamp.
   */
  async updateConversationTimestamp(userId: string): Promise<void> {
    const session = await conversationStore.get(userId);
    if (!session) return;

    session.updatedAt = new Date();
    await conversationStore.save(session);
  }

  /**
   * Resets session status to ACTIVE and clears the pending clarification request.
   */
  async clearClarification(userId: string): Promise<void> {
    await this.clearPendingState(userId);
  }

  /**
   * Closes the session manually.
   */
  async closeSession(userId: string): Promise<void> {
    await conversationStore.close(userId);
    const trace = aiTraceLogger.current();
    if (trace) {
      trace.log("ConversationRuntime", "Session Closed", { userId });
    }
  }

  /**
   * Delegated references maintenance logic.
   */
  updateReferences(session: ConversationSession, resolvedIntentPlan: ResolvedIntentPlan): void {
    conversationReferenceManager.updateReferences(session, resolvedIntentPlan);
  }

  /**
   * Delegated pronoun resolution logic.
   */
  resolveReferences(intentPlan: IntentPlan, session: ConversationSession): IntentPlan {
    return pronounResolver.resolveReferences(intentPlan, session);
  }

  /**
   * Delegated clarification candidate selection logic.
   */
  resolveClarification(
    userMessage: string,
    clarificationRequest: ClarificationRequest,
    session?: ConversationSession
  ): ClarificationOption | null {
    return clarificationResolver.resolveClarification(userMessage, clarificationRequest, session);
  }
}

export default new ConversationManager();
