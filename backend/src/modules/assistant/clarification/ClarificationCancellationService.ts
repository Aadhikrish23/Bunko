import { ConversationSession } from "../conversation/ConversationSession";
import conversationManager from "../conversation/ConversationManager";
import aiTraceLogger from "../debug/AITraceLogger";

export class ClarificationCancellationService {
  private readonly cancelKeywords = ["cancel", "stop", "never mind", "exit", "abort"];

  /**
   * Asserts if the response matches cancel keyword intents. Cleans up session if matches.
   */
  async checkCancellation(session: ConversationSession, request: string): Promise<boolean> {
    const norm = request.trim().toLowerCase();
    if (this.cancelKeywords.includes(norm)) {
      await conversationManager.clearClarification(session.userId);

      const trace = aiTraceLogger.current();
      if (trace) {
        trace.log("ClarificationRuntime", "Clarification Cancelled", {
          sessionId: session.sessionId,
          userMessage: request,
        });
      }
      return true;
    }

    return false;
  }
}

export default new ClarificationCancellationService();
