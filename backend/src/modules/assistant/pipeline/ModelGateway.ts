import { AIProvider } from "../providers/AIProvider";
import { CapabilityRegistry } from "../planning/CapabilityRegistry";
import { IntentPlan } from "../intent/IntentPlan";
import { domainPack } from "../domain/activeDomain";

/** The two kinds of model call the runtime makes: planning actions and answering questions. */
export class ModelGateway {
  constructor(
    private readonly provider: AIProvider,
    private readonly capabilityRegistry: CapabilityRegistry,
  ) {}

  /** The planner occasionally returns malformed JSON; one retry usually fixes it. */
  async planWithRetry(request: string, context: any): Promise<IntentPlan> {
    try {
      return await this.provider.plan(request, context, this.capabilityRegistry.list());
    } catch (error: any) {
      if (error?.code !== "PROVIDER_VALIDATION_ERROR") throw error;
      // At temperature 0 the same prompt gives the same broken reply, so the retry leaves out
      // the recent conversation (the model once looped on its own earlier replies).
      return this.provider.plan(request, { ...context, recentExchanges: [] }, this.capabilityRegistry.list());
    }
  }

  /**
   * Answer mode can't change anything, but the model once replied "I've added Elden Ring ... and
   * included it in the Soulslikes collection" when nothing ran. A reply claiming an action is replaced.
   */
  async answerSafely(question: string, context: any): Promise<string> {
    const domain = domainPack();
    // Shorthand spelled out and facts looked up, so the model doesn't guess them.
    const prepared = await domain.prepareQuestion(question, context);
    const answer = await this.provider.answer(prepared.question, prepared.context);
    if (domain.phrases.claimsAction.test(answer)) return domain.phrases.claimsActionReply;
    return answer;
  }
}
