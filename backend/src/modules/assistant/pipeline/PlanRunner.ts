import { AIExecutor } from "../sdk/AIExecutor";
import { AIToolRegistry } from "../sdk/AIToolRegistry";
import { ContextBuilder } from "../context/ContextBuilder";
import type { AIToolContext } from "../sdk/AIToolContext";
import { RuntimeProfiler } from "../debug/RuntimeProfiler";
import conversationRuntime from "../conversation/ConversationRuntime";
import clarificationRuntime from "../clarification/ClarificationRuntime";
import { PlanningRuntime } from "../planning/PlanningRuntime";
import { PlanningStatus } from "../planning/PlanningStatus";
import { ExecutionRuntime } from "../execution/ExecutionRuntime";
import { IntentPlan } from "../intent/IntentPlan";
import { ConversationSession } from "../conversation/ConversationSession";
import type { RuntimeResponse } from "./Replies";
import { domainPack } from "../domain/activeDomain";

/** Planning, clarification, confirmation and execution for one intent plan. */
export class PlanRunner {
  private readonly planningRuntime: PlanningRuntime;
  private readonly executionRuntime: ExecutionRuntime;

  constructor(contextBuilder: ContextBuilder, toolRegistry: AIToolRegistry, executor: AIExecutor) {
    this.planningRuntime = new PlanningRuntime(contextBuilder);
    this.executionRuntime = new ExecutionRuntime(toolRegistry, executor);
  }

  async run(
    intentPlan: IntentPlan,
    session: ConversationSession,
    cleanRequest: string,
    toolContext: AIToolContext,
    memoryContext: any,
    profiler: RuntimeProfiler,
    confirmed: boolean,
  ): Promise<RuntimeResponse> {
    const { userId, requestId = "" } = toolContext;

    // Resolve capabilities, context, entities, and execute PlanningEngine.
    profiler.startLayer("planning");
    const planningResultWrapper = await this.planningRuntime.plan(userId, intentPlan, session, cleanRequest);
    const planningResult = planningResultWrapper.planningResult;
    const resolvedIntentPlan = planningResultWrapper.resolvedIntentPlan;
    profiler.stopLayer("planning");

    if (planningResult.status === PlanningStatus.FAILED) {
      // "No resolved capabilities matched the user's intent." is for the trace log, not the user.
      const internal = /no resolved capabilities/i.test(planningResult.explanation ?? "");
      return { success: false, message: internal ? domainPack().phrases.notSureWhatToChange : planningResult.explanation };
    }

    // Evaluate the planning result and pause for a clarifying question if needed.
    profiler.startLayer("clarification");
    const clarificationResult = await clarificationRuntime.evaluate(planningResult, session, intentPlan, requestId, cleanRequest);
    profiler.stopLayer("clarification");

    if (clarificationResult.pause) {
      return { ...(clarificationResult.response as any) };
    }

    // Some changes ask first (removing a game deletes its review and notes too).
    if (!confirmed) {
      const card = await domainPack().confirmBeforeRunning(intentPlan, resolvedIntentPlan, { userId, requestId, message: cleanRequest });
      if (card) return card;
    }

    // Build the execution plan, validate, adapt, and execute.
    profiler.startLayer("execution");
    const executionResult = await this.executionRuntime.execute(
      planningResult,
      resolvedIntentPlan,
      userId,
      requestId,
      toolContext,
      session,
      memoryContext,
      cleanRequest,
    );
    profiler.stopLayer("execution");

    if (executionResult.status === "FAILED") {
      return { success: false, message: executionResult.summary, errors: executionResult.errors };
    }

    // Record success and save references.
    profiler.startLayer("conversation");
    const conversationResult = await conversationRuntime.handleSuccess(
      userId,
      session,
      intentPlan,
      resolvedIntentPlan,
      executionResult.executionId,
      requestId,
      cleanRequest,
    );
    profiler.stopLayer("conversation");

    return {
      ...conversationResult,
      success: executionResult.status === "SUCCESS",
      status: executionResult.status,
      message: domainPack().describeResults(executionResult),
      // Work only the app can do (e.g. start a game on this PC); see AIClientAction.
      ...(toolContext.clientActions?.length ? { clientActions: toolContext.clientActions } : {}),
    };
  }

}
