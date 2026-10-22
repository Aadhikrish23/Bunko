import { PlanningResult } from "../../planning/PlanningResult";
import { ClarificationRequest } from "../../entity/ClarificationRequest";
import { ClarificationType } from "../ClarificationType";
import clarificationTemplateRegistry from "../ClarificationTemplateRegistry";
import clarificationOptionBuilder from "../ClarificationOptionBuilder";
import aiTraceLogger from "../../debug/AITraceLogger";
import crypto from "crypto";

export class AmbiguousEntityClarificationBuilder {
  /**
   * Builds clarification request for ambiguous entity resolutions.
   */
  build(planningResult: PlanningResult, userId: string): ClarificationRequest | null {
    if (!planningResult.clarificationRequest) return null;

    const origReq = planningResult.clarificationRequest;
    const type = ClarificationType.AMBIGUOUS_ENTITY;

    const options = (origReq.candidates || []).map((c) =>
      clarificationOptionBuilder.build(c, origReq.entityType)
    );

    // One close-but-not-exact match is a "did you mean", not a choice between several.
    const question = options.length === 1
      ? `Did you mean ${options[0]!.label}?`
      : clarificationTemplateRegistry.getQuestion(type, {
          originalQuery: origReq.originalQuery,
          entityType: origReq.entityType,
        });

    const allowFreeText = true;
    const trace = aiTraceLogger.current();
    if (trace) {
      trace.log("ClarificationRuntime", "Template Selected", { type });
      trace.log("ClarificationRuntime", "Question Generated", { question });
      trace.log("ClarificationRuntime", "Option Count", { count: options.length });
    }

    const uuid = origReq.requestId || crypto.randomUUID();

    return {
      id: uuid,
      requestId: uuid,
      type,
      question,
      // Shown to the user as the card heading.
      reason: options.length === 1 ? question : `A few games match "${origReq.originalQuery}". Which one?`,
      entityType: origReq.entityType,
      originalQuery: origReq.originalQuery,
      candidates: options,
      options,
      allowFreeText,
      metadata: { userId },
    };
  }
}

export default new AmbiguousEntityClarificationBuilder();
