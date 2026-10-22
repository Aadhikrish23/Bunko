import { PlanningResult } from "../../planning/PlanningResult";
import { ClarificationRequest } from "../../entity/ClarificationRequest";
import { ClarificationType } from "../ClarificationType";
import clarificationStrategy from "../ClarificationStrategy";
import clarificationTemplateRegistry from "../ClarificationTemplateRegistry";
import clarificationOptionBuilder from "../ClarificationOptionBuilder";
import aiTraceLogger from "../../debug/AITraceLogger";
import crypto from "crypto";

export class MissingParameterClarificationBuilder {
  /**
   * Builds clarification request for missing required parameter inputs.
   */
  build(planningResult: PlanningResult, userId: string): ClarificationRequest | null {
    if (!planningResult.missingFacts || planningResult.missingFacts.length === 0) return null;

    const prioritized = clarificationStrategy.prioritizeMissingFacts(planningResult.missingFacts);
    const missingFact = prioritized[0]!;

    let type = ClarificationType.MISSING_PARAMETER;
    let rawOptions: Array<{ id: string; label: string; description: string }> = [];

    const factLower = missingFact.toLowerCase();
    if (factLower === "rating") {
      rawOptions = [
        { id: "10", label: "10 (Masterpiece)", description: "Give highest rating" },
        { id: "9", label: "9 (Great)", description: "Give great rating" },
        { id: "8", label: "8 (Very Good)", description: "Give very good rating" },
        { id: "7", label: "7 (Good)", description: "Give good rating" },
        { id: "5", label: "5 (Average)", description: "Give average rating" },
      ];
    } else if (factLower === "status") {
      rawOptions = [
        { id: "Plan to Play", label: "Plan to Play", description: "Set status to Plan to Play" },
        { id: "Playing", label: "Playing", description: "Set status to Playing" },
        { id: "Completed", label: "Completed", description: "Set status to Completed" },
        { id: "Dropped", label: "Dropped", description: "Set status to Dropped" },
      ];
    } else if (factLower === "book" || factLower === "entity") {
      type = ClarificationType.MISSING_ENTITY;
    }

    const question = clarificationTemplateRegistry.getQuestion(type, {
      missingFact,
      entityType: missingFact,
    });

    const options = rawOptions.map((o) =>
      clarificationOptionBuilder.build(o, missingFact)
    );

    const allowFreeText = true;
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
      // Shown to the user as the card heading, so it is the question itself.
      reason: question,
      entityType: missingFact,
      originalQuery: "",
      candidates: options,
      options,
      allowFreeText,
      metadata: { userId, missingFact },
    };
  }
}

export default new MissingParameterClarificationBuilder();
