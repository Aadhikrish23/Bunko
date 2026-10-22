import { PlanningResult } from "../../planning/PlanningResult";
import { ClarificationRequest } from "../../entity/ClarificationRequest";
import { ClarificationType } from "../ClarificationType";
import clarificationTemplateRegistry from "../ClarificationTemplateRegistry";
import clarificationOptionBuilder from "../ClarificationOptionBuilder";
import aiTraceLogger from "../../debug/AITraceLogger";
import crypto from "crypto";

export class ConfirmationClarificationBuilder {
  /**
   * Builds clarification request when user confirmation is required.
   */
  build(planningResult: PlanningResult, userId: string): ClarificationRequest | null {
    if (planningResult.clarificationRequest?.type !== ClarificationType.CONFIRM_ACTION) return null;

    const type = ClarificationType.CONFIRM_ACTION;
    const question = clarificationTemplateRegistry.getQuestion(type, {});
    const options = [
      clarificationOptionBuilder.build({ id: "yes", label: "Yes, proceed" }, "confirmation"),
      clarificationOptionBuilder.build({ id: "no", label: "No, cancel" }, "confirmation"),
    ];

    const allowFreeText = false;
    const trace = aiTraceLogger.current();
    if (trace) {
      trace.log("ClarificationRuntime", "Template Selected", { type });
      trace.log("ClarificationRuntime", "Question Generated", { question });
      trace.log("ClarificationRuntime", "Option Count", { count: options.length });
    }

    const uuid = crypto.randomUUID();

    return {
      id: uuid,
      requestId: uuid,
      type,
      question,
      reason: "Action confirmation required",
      entityType: "confirmation",
      originalQuery: "",
      candidates: options,
      options,
      allowFreeText,
      metadata: { userId },
    };
  }
}

export default new ConfirmationClarificationBuilder();
