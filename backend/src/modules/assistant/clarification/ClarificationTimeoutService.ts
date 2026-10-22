import { ConversationSession } from "../conversation/ConversationSession";
import { ConversationRuntimeConfig } from "../conversation/ConversationRuntimeConfig";
import conversationManager from "../conversation/ConversationManager";
import aiTraceLogger from "../debug/AITraceLogger";

export class ClarificationTimeoutService {
  /**
   * Evaluates if the pending clarification has timed out. Cleans up session if expired.
   */
  async checkTimeout(session: ConversationSession): Promise<boolean> {
    const createdAt = session.pendingState?.clarificationCreatedAt;
    if (!createdAt) return false;

    const elapsed = Date.now() - new Date(createdAt).getTime();
    if (elapsed > ConversationRuntimeConfig.CLARIFICATION_TIMEOUT_MS) {
      await conversationManager.clearClarification(session.userId);

      const trace = aiTraceLogger.current();
      if (trace) {
        trace.log("ClarificationRuntime", "Clarification Expired", {
          sessionId: session.sessionId,
          elapsedMs: elapsed,
        });
      }
      return true;
    }

    return false;
  }
}

export default new ClarificationTimeoutService();
