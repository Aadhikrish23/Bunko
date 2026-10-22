import { LLMIntentResponse } from "../providers/contracts/LLMIntentResponse";
import { IntentPlan } from "./IntentPlan";
import { AIIntent } from "./AIIntent";
import crypto from "crypto";

export class IntentNormalizer {
  private readonly defaultConfidence: number = 1.0;

  /**
   * Normalizes an LLMIntentResponse into a complete, validated IntentPlan.
   */
  normalize(response: LLMIntentResponse, requestId: string): IntentPlan {
    const intents: AIIntent[] = (response.intents || []).map((intent) => {
      const targets = (intent.targets || []).map((t) => ({
        type: t.type,
        name: t.name || "",
      }));

      const parameters = (intent.parameters || []).map((p) => ({
        type: p.type,
        value: p.value,
      }));

      return {
        type: intent.type,
        confidence: this.defaultConfidence,
        targets,
        parameters,
      };
    });

    return {
      id: crypto.randomUUID(),
      requestId,
      intents,
      reasoning: "Normalized by backend runtime.",
    };
  }
}

export default new IntentNormalizer();
