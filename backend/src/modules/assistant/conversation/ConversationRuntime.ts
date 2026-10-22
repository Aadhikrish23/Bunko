import { ConversationSession } from "./ConversationSession";
import { ConversationTurn } from "./ConversationTurn";
import { ConversationStatus } from "./ConversationStatus";
import conversationManager from "./ConversationManager";
import conversationContextBuilder from "./ConversationContextBuilder";
import { AIRequestContext } from "./AIRequestContext";
import { IntentPlan } from "../intent/IntentPlan";
import { ResolvedIntentPlan } from "../entity/ResolvedIntentPlan";
import { ClarificationRequest } from "../entity/ClarificationRequest";
import { AIToolContext } from "../sdk/AIToolContext";
import aiTraceLogger from "../debug/AITraceLogger";


import conversationLifecycleService from "./ConversationLifecycleService";

export class ConversationRuntime {
  /**
   * Loads the session and resolves pending clarifications if present.
   */
  async loadOrResume(
    userId: string,
    request: string,
    requestId: string,
  ): Promise<{
    session: ConversationSession;
    intentPlan: IntentPlan | null;
    requestContext?: AIRequestContext;
  }> {
    const session = await conversationManager.getOrCreateSession(userId);

    // New request: Build AIRequestContext
    const toolContext: AIToolContext = { userId, requestId };
    const conversationContext = conversationContextBuilder.build(session);
    const requestContext: AIRequestContext = {
      toolContext,
      conversationContext,
    };

    return {
      session,
      intentPlan: null,
      requestContext,
    };
  }


  /**
   * Resolves target names that are pronouns using current slots.
   */
  resolveReferences(intentPlan: IntentPlan, session: ConversationSession): IntentPlan {
    return conversationManager.resolveReferences(intentPlan, session);
  }

  /**
   * Handles CLARIFICATION_REQUIRED. Stores clarification and pending intentPlan, logs turn.
   */
  async handleClarificationRequired(
    userId: string,
    session: ConversationSession,
    intentPlan: IntentPlan,
    clarificationRequest: ClarificationRequest,
    explanation: string,
    requestId: string,
    request: string,
  ): Promise<{
    success: boolean;
    status: string;
    message: string;
    clarificationRequest: ClarificationRequest;
  }> {
    const response = {
      success: false,
      status: "CLARIFICATION_REQUIRED",
      message: clarificationRequest.question || clarificationRequest.reason,
      clarificationRequest,
    };

    // Store in session via conversationManager
    await conversationManager.markClarificationCreated(userId, clarificationRequest, intentPlan);

    // Append turn
    const turn: ConversationTurn = {
      requestId,
      timestamp: new Date(),
      userMessage: request,
      assistantResponse: response,
      intentPlanId: intentPlan.requestId,
      executionPlanId: null,
      summary: `Clarification required: ${explanation}`,
      referencesCreated: [],
    };
    await conversationManager.appendTurn(userId, turn);

    return response;
  }

  /**
   * Handles SUCCESS. Updates references, logs turn.
   */
  async handleSuccess(
    userId: string,
    session: ConversationSession,
    intentPlan: IntentPlan,
    resolvedIntentPlan: ResolvedIntentPlan,
    executionPlanId: string,
    requestId: string,
    request: string,
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    const response = {
      success: true,
      message: "AI Layer Ready",
    };

    // Update memory/references
    conversationManager.updateReferences(session, resolvedIntentPlan);

    // Notify event publisher
    await conversationLifecycleService.publishExecutionSuccess(userId, resolvedIntentPlan);


    // Append turn
    const turn: ConversationTurn = {
      requestId,
      timestamp: new Date(),
      userMessage: request,
      assistantResponse: response,
      intentPlanId: intentPlan.requestId,
      executionPlanId,
      summary: `Successfully executed intents: ${intentPlan.intents.map((i) => i.type).join(", ")}`,
      referencesCreated: resolvedIntentPlan.resolvedTargets
        .filter((t) => t.resolution?.status === "RESOLVED")
        .map((t) => t.originalTarget.name),
    };
    await conversationManager.appendTurn(userId, turn);

    return response;
  }
}

export default new ConversationRuntime();
