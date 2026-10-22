import { AIRequestContext } from "../conversation/AIRequestContext";
import { Capability } from "../planning/Capability";
import { IntentPlan } from "../intent/IntentPlan";

export interface AIProvider {
  plan(
    request: string,
    context: AIRequestContext,
    capabilities: Capability[],
  ): Promise<IntentPlan>;

  /** A plain-text reply to a gaming question (no actions). */
  answer(question: string, context: AIRequestContext): Promise<string>;
}


