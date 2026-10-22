import { AIExecutor } from "./sdk/AIExecutor";
import { AIProvider } from "./providers/AIProvider";
import { AIToolRegistry } from "./sdk/AIToolRegistry";
import { ContextBuilder } from "./context/ContextBuilder";
import { CapabilityRegistry } from "./planning/CapabilityRegistry";
import aiTraceLogger from "./debug/AITraceLogger";
import type { AIClientCapabilities, AIToolContext } from "./sdk/AIToolContext";
import { RuntimeProfiler } from "./debug/RuntimeProfiler";
import { AIRuntimeError } from "./runtime/errors/AIRuntimeError";

import conversationRuntime from "./conversation/ConversationRuntime";
import { matchGreeting, GreetingKind } from "./conversation/GreetingMatcher";
import clarificationRuntime from "./clarification/ClarificationRuntime";
import memoryRuntime from "./memory/MemoryRuntime";
import { IntentPlan } from "./intent/IntentPlan";
import { CoreIntentType } from "./intent/IntentType";
import { IntentParameterType } from "./intent/IntentParameterType";
import pendingConfirmations, { isCancelReply } from "./conversation/PendingConfirmationStore";
import recentExchanges from "./conversation/RecentExchanges";
import conversationManager from "./conversation/ConversationManager";
import { type RuntimeResponse } from "./pipeline/Replies";
import { ModelGateway } from "./pipeline/ModelGateway";
import { handlePending } from "./pipeline/PendingStage";
import { PlanRunner } from "./pipeline/PlanRunner";
import { domainPack } from "./domain/activeDomain";
import type { GroundingResult } from "./domain/DomainPack";

/**
 * One chat message, start to finish. The stages live in ./pipeline:
 *
 *   pending yes/no  ->  clarification resume  ->  pre-route (data answers, plain commands,
 *   then the model)  ->  corrections (the user's own words)  ->  grounding (real items only)
 *   ->  shaping  ->  answer or run (planning, confirmation, execution).
 */
/**
 * "yeah add it, and put ds3 in there too": the first part already happened. If the rest fails
 * (the model timed out), say what was done and what wasn't, instead of an error card that hid
 * the part that ran -- the playtester then couldn't tell Elden Ring had been added.
 */
function withRest(done: string, rest: string, more: RuntimeResponse): RuntimeResponse {
  if (more.success || more.status === "CONFIRMATION_REQUIRED" || more.status === "CANCELLED") {
    return { ...more, message: `${done} ${more.message}`.trim() };
  }
  const why = String(more.message || "").replace(/\s*Simple requests like[\s\S]*$/, "").trim();
  return {
    success: true,
    status: "PARTIAL",
    message: `${done} I couldn't get to the rest ("${rest}")${why ? `: ${why}` : "."} Send that part again and I'll do it.`.trim(),
  };
}

export class AIRuntime {
  private readonly model: ModelGateway;
  private readonly runner: PlanRunner;

  constructor(
    provider: AIProvider,
    executor: AIExecutor,
    toolRegistry: AIToolRegistry,
    contextBuilder: ContextBuilder,
    capabilityRegistry: CapabilityRegistry,
  ) {
    this.model = new ModelGateway(provider, capabilityRegistry);
    this.runner = new PlanRunner(contextBuilder, toolRegistry, executor);
  }

  async chat(userId: string, request: string, requestId: string, client: AIClientCapabilities = { canLaunchGames: false }): Promise<RuntimeResponse> {
    const profiler = new RuntimeProfiler();
    profiler.startOverall();

    const domain = domainPack();
    const cleanRequest = request ? domain.normalizeMessage(request.trim().replace(/\s+/g, " "), recentExchanges.get(userId).slice(-1)[0]) : "";

    return aiTraceLogger.run(requestId, async () => {
      const trace = aiTraceLogger.current();
      if (trace) {
        trace.writeHeader(userId, cleanRequest);
        trace.log("AIRuntime", "Runtime Started", { userId, request: cleanRequest });
      }

      const toolContext: AIToolContext = { userId, requestId, client, clientActions: [] };

      const finish = (response: RuntimeResponse) => {
        profiler.stopOverall();
        const final = { ...response, message: domain.finishReply(userId, requestId, response.message), metrics: profiler.getMetrics() };
        recentExchanges.add(userId, cleanRequest, final.message || "");
        if (trace) {
          const status = final.status || (final.success ? "SUCCESS" : "FAILED");
          trace.updateStats({ status });
          trace.log("FinalResponse", "Completed", final);
          trace.log("AIRuntime", "Runtime Finished", { status });
          trace.end();
        }
        return final;
      };

      try {
        profiler.startLayer("conversation");
        const { session, requestContext } = await conversationRuntime.loadOrResume(userId, cleanRequest, requestId);
        profiler.stopLayer("conversation");

        profiler.startLayer("memory");
        const memoryContext = await memoryRuntime.loadMemoryContext(userId);
        profiler.stopLayer("memory");

        let intentPlan: IntentPlan | null = null;
        let confirmed = false;
        let fromModel = false;
        let unrequested = 0;
        let notice: string | undefined;
        let planText = cleanRequest;

        // An offer or removal we asked about last turn.
        const pending = await handlePending(userId, cleanRequest);
        if (pending.kind === "reply") return finish(pending.response);
        if (pending.kind === "more") {
          // "yeah do it, and hollow knight too": did what we offered; the rest is a new message.
          const more: RuntimeResponse = await this.chat(userId, pending.rest, `${requestId}-more`, client);
          return finish(withRest(pending.done, pending.rest, more));
        }
        if (pending.kind === "plan") {
          intentPlan = pending.plan;
          confirmed = true;
        }

        // A bare "no" / "never mind" with nothing pending just means "leave it".
        if (!intentPlan && isCancelReply(cleanRequest) && session.status !== "WAITING_FOR_CLARIFICATION") {
          return finish({ success: true, status: "CANCELLED", message: "Okay, I won't change anything." });
        }

        // The answer to a clarifying question we asked.
        if (!intentPlan) {
          profiler.startLayer("clarification");
          const resumeResult = await clarificationRuntime.resume(session, cleanRequest, requestId);
          profiler.stopLayer("clarification");
          if (resumeResult.errorResponse) return finish({ ...(resumeResult.errorResponse as any) });
          if (resumeResult.isResumed && resumeResult.intentPlan) intentPlan = resumeResult.intentPlan;
        }

        if (requestContext) requestContext.memoryContext = memoryContext;

        // A pure greeting needs no model, so it's answered even when the LLM is offline.
        const greetingKind = intentPlan ? null : matchGreeting(cleanRequest);

        if (!intentPlan && !greetingKind && requestContext) {
          const routed = await domain.preRoute({ userId, requestId, message: cleanRequest, client, session, requestContext, model: this.model });
          if (routed.kind === "reply" && routed.rest) {
            const more: RuntimeResponse = await this.chat(userId, routed.rest, `${requestId}-more`, client);
            return finish(withRest(routed.response.message ?? "", routed.rest, more));
          }
          if (routed.kind === "reply") return finish(routed.response);
          notice = routed.notice;
          // With "it" pinned to a game ("put Dead Cells in there, and start sekiro"), later checks read that.
          planText = routed.pinned ?? cleanRequest;
          intentPlan = conversationRuntime.resolveReferences(routed.plan, session);
          fromModel = true;
          unrequested = domain.correctPlan(intentPlan, {
            message: planText,
            lastReply: recentExchanges.get(userId).slice(-1)[0]?.assistant ?? "",
            requestContext,
          });
        }

        if (intentPlan) domain.normalizePlan(intentPlan);

        // Only act on things the user named or clearly referred to.
        let grounding: GroundingResult = { ungrounded: 0, skippedMissing: [], keptReviews: [] };
        if (intentPlan && fromModel) {
          grounding = await domain.groundPlan(intentPlan, {
            userId,
            message: planText,
            requestContext: requestContext ?? undefined,
            lastExchange: recentExchanges.get(userId).slice(-1)[0],
            session,
          });
        }
        const { ungrounded, skippedMissing, keptReviews } = grounding;

        if (intentPlan) domain.shapePlan(intentPlan, cleanRequest, fromModel);

        // Conversation the model handles itself: greetings, help, questions it
        // can answer, and requests the app can't do (it writes the reply).
        const conversational = intentPlan?.intents?.filter((i) => i.type === CoreIntentType.AskQuestion || i.type === CoreIntentType.Help) ?? [];
        const actionable = intentPlan?.intents?.filter((i) => i.type !== CoreIntentType.AskQuestion && i.type !== CoreIntentType.Help) ?? [];

        // A real question gets a real answer from the model (a second, plain-text call);
        // refusals and "didn't catch that" keep the model's short reply.
        const modelReply = conversational
          .map((i) => i.parameters?.find((p) => p.type === IntentParameterType.Text)?.value)
          .find((v) => typeof v === "string" && v.trim().length > 0) as string | undefined;
        const wantsAnswer =
          !greetingKind &&
          conversational.some((i) => i.type === CoreIntentType.AskQuestion) &&
          (!modelReply || (domain.phrases.looksLikeQuestion.test(cleanRequest) && !domain.phrases.keepModelReply.test(modelReply)));
        let generalAnswer: string | undefined = modelReply;
        if (wantsAnswer && requestContext) {
          try {
            generalAnswer = (await this.model.answerSafely(domain.withPageContext(cleanRequest, requestContext.page?.gameTitle), requestContext)) || modelReply;
          } catch {
            generalAnswer = modelReply;
          }
        }

        if (greetingKind || (conversational.length > 0 && actionable.length === 0)) {
          const replyKind: GreetingKind =
            greetingKind ?? (conversational.some((i) => i.type === CoreIntentType.Help) ? "capabilities" : "hello");
          const message = !greetingKind && generalAnswer ? generalAnswer.trim() : domain.phrases.greetings[replyKind];
          return finish({ success: true, message });
        }

        const missingNote = skippedMissing.length ? domain.phrases.missing(skippedMissing) : "";
        // Everything planned was something the message didn't ask for: change nothing.
        if (actionable.length === 0 && unrequested > 0 && ungrounded === 0 && skippedMissing.length === 0) {
          return finish({ success: true, status: "CLARIFICATION_REQUIRED", message: domain.phrases.notSureWhatToChange });
        }
        if (actionable.length === 0 && (ungrounded > 0 || skippedMissing.length > 0)) {
          return finish({ success: true, status: "CLARIFICATION_REQUIRED", message: missingNote || domain.phrases.notSureWhich });
        }

        const plan: IntentPlan = { ...intentPlan!, intents: actionable };
        const decorate = (response: RuntimeResponse): RuntimeResponse => {
          let message = response.message;
          if (missingNote) message += ` ${missingNote}`;
          if (ungrounded > 0 && response.success) {
            message += ` ${domain.phrases.ungrounded}`;
          }
          if (response.success && keptReviews.length > 0) {
            message += ` ${domain.phrases.keptReview}`;
          }
          if (notice) message = `${notice} ${message}`;
          else if (response.success && domain.phrases.correction.test(cleanRequest)) message = `Sorry about that. ${message}`;
          // "pause rdr2. also is elden ring hard?" -- answer the question part too.
          if (generalAnswer) message = `${message} ${generalAnswer.trim()}`;
          return { ...response, message };
        };
        const run = (p: IntentPlan) => this.runner.run(p, session, cleanRequest, toolContext, memoryContext, profiler, confirmed);
        // What this plan is about to change, so "undo" / "no, I meant X" can put it back.
        const before = await domain.undo.snapshotBefore(userId, plan).catch(() => undefined);
        const remember = (response: RuntimeResponse) => {
          if (!response.success || response.status?.match(/CONFIRMATION|CLARIFICATION/)) return;
          if (domain.undo.hasUntrackedChanges(plan)) domain.undo.forget(userId);
          else if (before) domain.undo.remember(userId, before);
        };

        // Some steps must finish before the rest can find what they made ("add celeste and
        // mark it completed"), so they run as their own first phase.
        const additions = plan.intents.filter((i) => domain.runsFirst(i.type));
        const rest = plan.intents.filter((i) => !domain.runsFirst(i.type));
        if (additions.length > 0 && rest.length > 0) {
          const first = await run({ ...plan, intents: additions });
          if (!first.success) return finish(first);
          const second = await run({ ...plan, intents: rest });
          remember(second);
          return finish(decorate({
            ...second,
            message: `${first.message} ${second.message}`.trim(),
            ...(toolContext.clientActions?.length ? { clientActions: toolContext.clientActions } : {}),
          }));
        }

        const outcome = decorate(await run(plan));
        remember(outcome);
        // "Want me to add DS3 and Elden Ring to it?" / "Want me to mark it Completed?"
        if (outcome.success && !outcome.status?.match(/CONFIRMATION|CLARIFICATION/)) {
          const offer = await domain.followUpOffer(userId, plan, cleanRequest).catch(() => undefined);
          if (offer) {
            pendingConfirmations.put(userId, { run: offer.run, label: offer.label, collection: offer.collection });
            return finish({ ...outcome, message: `${outcome.message} ${offer.question}` });
          }
        }
        return finish(outcome);
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (trace) {
          trace.updateStats({ status: "FAILED" });
          trace.log("FinalResponse", "Completed", { success: false, message: errorMsg });
          trace.log("AIRuntime", "Runtime Failed", { error: errorMsg });
          trace.end();
        }
        profiler.stopOverall();

        if (error instanceof AIRuntimeError) throw error;
        throw new AIRuntimeError(errorMsg, "AI_RUNTIME_ERROR", false, {}, error);
      }
    });
  }

  /** "Clear" in the chat: drop the remembered exchanges, pending confirmation and references. */
  async reset(userId: string) {
    recentExchanges.clear(userId);
    pendingConfirmations.take(userId);
    const session = await conversationManager.getOrCreateSession(userId);
    session.references = { ...session.references, currentGame: null, currentCollection: null, currentProvider: null, lastEntity: null };
    await conversationManager.saveSession(session);
  }
}

export default AIRuntime;
