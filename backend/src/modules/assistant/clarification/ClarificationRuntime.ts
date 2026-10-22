import { ConversationSession } from "../conversation/ConversationSession";
import { IntentPlan } from "../intent/IntentPlan";
import conversationManager from "../conversation/ConversationManager";
import conversationResumeBuilder from "../conversation/ConversationResumeBuilder";
import clarificationBuilder from "./ClarificationBuilder";
import { PlanningStatus } from "../planning/PlanningStatus";
import { PlanningResult } from "../planning/PlanningResult";
import conversationRuntime from "../conversation/ConversationRuntime";
import { ConversationRuntimeConfig } from "../conversation/ConversationRuntimeConfig";
import conversationLifecycleService from "../conversation/ConversationLifecycleService";
import { ClarificationRequest } from "../entity/ClarificationRequest";
import clarificationTimeoutService from "./ClarificationTimeoutService";
import clarificationCancellationService from "./ClarificationCancellationService";
import clarificationResponseBuilder from "./ClarificationResponseBuilder";
import aiTraceLogger from "../debug/AITraceLogger";

export interface ClarificationResponse {
  success: boolean;
  status?: string;
  message?: string;
  clarificationRequest?: ClarificationRequest;
}

export class ClarificationRuntime {
  /**
   * Resumes execution from a pending clarification request.
   */
  async resume(
    session: ConversationSession,
    request: string,
    requestId: string
  ): Promise<{ intentPlan: IntentPlan | null; isResumed: boolean; errorResponse?: ClarificationResponse }> {
    const trace = aiTraceLogger.current();

    if (
      session.status === "WAITING_FOR_CLARIFICATION" &&
      session.pendingClarification
    ) {
      if (trace) {
        trace.log("ClarificationRuntime", "Clarification Started", { sessionId: session.sessionId });
      }

      // 1. Timeout detection
      const isTimeout = await clarificationTimeoutService.checkTimeout(session);
      if (isTimeout) {
        if (trace) {
          trace.log("ClarificationRuntime", "Clarification Failed", { reason: "Timeout" });
        }
        return {
          intentPlan: null,
          isResumed: false,
          errorResponse: clarificationResponseBuilder.buildExpired(),
        };
      }

      // 2. Cancellation check
      const isCancelled = await clarificationCancellationService.checkCancellation(session, request);
      if (isCancelled) {
        if (trace) {
          trace.log("ClarificationRuntime", "Clarification Failed", { reason: "User cancelled" });
        }
        return {
          intentPlan: null,
          isResumed: false,
          errorResponse: clarificationResponseBuilder.buildCancelled(),
        };
      }

      // 3. Resolve clarification choice
      const selected = conversationManager.resolveClarification(
        request,
        session.pendingClarification,
        session
      );

      if (selected) {
        if (trace) {
          trace.log("ClarificationRuntime", "Resolved Choice", {
            choiceId: selected.id,
            choiceLabel: selected.label,
          });
        }

        await conversationLifecycleService.publishClarificationSuccess(
          session.userId,
          session.pendingClarification.originalQuery,
          selected.label
        );

        const pendingPlan = session.pendingState?.pendingIntentPlan as IntentPlan | undefined;
        if (pendingPlan) {
          const correctedPlan = conversationResumeBuilder.reconstruct(
            pendingPlan,
            session.pendingClarification.originalQuery,
            selected,
            requestId,
            session.pendingClarification
          );

          if (trace) {
            trace.log("ClarificationRuntime", "Execution Continued", {
              newRequestId: correctedPlan.requestId,
            });
            trace.log("ClarificationRuntime", "Clarification Completed", { status: "SUCCESS" });
          }

          await conversationManager.clearClarification(session.userId);

          return {
            intentPlan: correctedPlan,
            isResumed: true,
          };
        }
      }

      // Check if this is a completely new command/intent or general conversation instead of a clarification reply.
      const normRequest = request.trim().toLowerCase();
      const words = normRequest.split(/\s+/);

      const actionVerbs = ["launch", "complete", "rate", "review", "create", "add", "remove", "update", "sync", "connect", "disconnect", "open", "play", "start", "finish", "actually"];
      const conversationalGreetings = ["hi", "hello", "thanks", "thank you", "good morning", "how are you", "what can you do", "help"];

      // Match on word/phrase boundaries, not raw substrings, so short tokens like
      // "hi" or "add" don't false-positive inside unrelated words (e.g. "think", "ladder").
      const containsPhrase = (phrase: string) =>
        new RegExp(`(?:^|\\s)${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|\\s)`).test(normRequest);

      const isAction = actionVerbs.some(verb => words.includes(verb));
      const isGreeting = conversationalGreetings.some(greet => words.includes(greet) || containsPhrase(greet));
      const looksLikeChoice = ["1", "2", "3", "first", "second", "third", "last", "one", "this", "that"].includes(normRequest) ||
                             (session.pendingClarification.candidates && session.pendingClarification.candidates.some(c => c.label.toLowerCase().includes(normRequest) || normRequest.includes(c.label.toLowerCase())));
      
      const isNewCommand = (isAction || isGreeting || !looksLikeChoice);

      if (isNewCommand) {
        await conversationManager.clearClarification(session.userId);
        if (trace) {
          trace.log("ClarificationRuntime", "Clarification Bypassed for New Command", {
            userMessage: request,
          });
        }
        return {
          intentPlan: null,
          isResumed: false,
        };
      }

      // 4. Invalid response retry increment
      const currentRetries = await conversationManager.incrementClarificationRetry(session.userId);

      if (currentRetries >= ConversationRuntimeConfig.MAX_CLARIFICATION_RETRIES) {
        await conversationManager.clearClarification(session.userId);

        if (trace) {
          trace.log("ClarificationRuntime", "Clarification Max Retries Exceeded", {
            sessionId: session.sessionId,
            retryCount: currentRetries,
          });
          trace.log("ClarificationRuntime", "Clarification Failed", { reason: "Max retries exceeded" });
        }

        return {
          intentPlan: null,
          isResumed: false,
          errorResponse: clarificationResponseBuilder.buildMaxRetriesExceeded(),
        };
      }

      if (trace) {
        trace.log("ClarificationRuntime", "Clarification Attempt Failed", {
          sessionId: session.sessionId,
          retryCount: currentRetries,
          userMessage: request,
        });
        trace.log("ClarificationRuntime", "Clarification Completed", { status: "RETRY_REQUIRED" });
      }

      return {
        intentPlan: null,
        isResumed: false,
        errorResponse: clarificationResponseBuilder.buildRetry(request, session.pendingClarification),
      };
    }

    return {
      intentPlan: null,
      isResumed: false,
    };
  }

  /**
   * Evaluates the planning result to check if clarification is required.
   */
  async evaluate(
    planningResult: PlanningResult,
    session: ConversationSession,
    intentPlan: IntentPlan,
    requestId: string,
    request: string
  ): Promise<{ pause: boolean; response?: ClarificationResponse }> {
    const trace = aiTraceLogger.current();

    const needsClarification =
      planningResult.status === PlanningStatus.CLARIFICATION_REQUIRED ||
      (planningResult.missingFacts && planningResult.missingFacts.length > 0);

    if (needsClarification) {
      if (trace) {
        trace.log("ClarificationRuntime", "Clarification Started", { sessionId: session.sessionId });
      }

      const clarificationRequest = clarificationBuilder.build(planningResult, session.userId);

      if (clarificationRequest) {
        if (trace) {
          trace.log("ClarificationRuntime", "Clarification Built", clarificationRequest);
          trace.log("ClarificationRuntime", "Chosen Strategy", {
            strategy: "Priority-based missing facts selection",
            primaryMissingFact: clarificationRequest.entityType,
            clarificationType: clarificationRequest.type,
          });
        }

        const response = await conversationRuntime.handleClarificationRequired(
          session.userId,
          session,
          intentPlan,
          clarificationRequest,
          planningResult.explanation,
          requestId,
          request
        );

        if (trace) {
          trace.log("ClarificationRuntime", "Clarification Stored", {
            sessionId: session.sessionId,
            clarificationRequestId: clarificationRequest.id,
          });
          trace.log("ClarificationRuntime", "Clarification Completed", {
            status: "PAUSED_FOR_USER_RESPONSE",
          });
        }

        return {
          pause: true,
          response,
        };
      }
    }

    return {
      pause: false,
    };
  }
}

export default new ClarificationRuntime();
