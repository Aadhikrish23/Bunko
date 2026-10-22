import { IntentPlan } from "../intent/IntentPlan";
import { ClarificationOption } from "../entity/ClarificationOption";
import aiTraceLogger from "../debug/AITraceLogger";
import { deepClone } from "../utils/DeepClone";

export class ConversationResumeBuilder {
  /**
   * Reconstructs and corrects the pending IntentPlan using the clarified selection.
   */
  reconstruct(
    pendingPlan: IntentPlan,
    originalQuery: string,
    selectedOption: ClarificationOption,
    newRequestId: string,
    pendingClarification?: any,
  ): IntentPlan {
    const cloned = deepClone(pendingPlan);

    if (pendingClarification && pendingClarification.type === "MISSING_PARAMETER") {
      const pType = String(pendingClarification.entityType).toLowerCase();
      let typeEnum = "Text";
      if (pType === "rating") typeEnum = "Rating";
      else if (pType === "status") typeEnum = "Status";
      else if (pType === "platform") typeEnum = "Platform";
      else if (pType === "provider") typeEnum = "Provider";
      else if (pType === "date") typeEnum = "Date";
      else if (pType === "boolean") typeEnum = "Boolean";

      let value: any = selectedOption.id;
      if (typeEnum === "Rating") {
        const num = Number(value);
        if (!isNaN(num)) value = num;
      }

      for (const intent of cloned.intents) {
        if (!intent.parameters) intent.parameters = [];
        // Prevent duplicate param if already somehow exists
        const exists = intent.parameters.some((p: any) => String(p.type).toLowerCase() === typeEnum.toLowerCase());
        if (!exists) {
          intent.parameters.push({
            type: typeEnum as any,
            value,
          });
        }
      }
    } else {
      for (const intent of cloned.intents) {
        if (intent.targets) {
          for (const target of intent.targets) {
            if (target.name === originalQuery) {
              target.name = selectedOption.label;
            }
          }
        }
      }
    }

    cloned.requestId = newRequestId;

    const trace = aiTraceLogger.current();
    if (trace) {
      trace.log("ClarificationRuntime", "Resume Builder", {
        originalPlanId: pendingPlan.requestId,
        newPlanId: cloned.requestId,
        correctedTarget: selectedOption.label,
      });
    }

    return cloned;
  }
}

export default new ConversationResumeBuilder();
