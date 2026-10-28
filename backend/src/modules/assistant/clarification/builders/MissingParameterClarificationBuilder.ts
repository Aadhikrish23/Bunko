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
      // Bunko ratings are whole stars, 1-5 (SRS §14) -- not a 10-point scale.
      rawOptions = [
        { id: "5", label: "5 (Loved it)", description: "Give 5 stars" },
        { id: "4", label: "4 (Really liked it)", description: "Give 4 stars" },
        { id: "3", label: "3 (It was okay)", description: "Give 3 stars" },
        { id: "2", label: "2 (Not for me)", description: "Give 2 stars" },
        { id: "1", label: "1 (Disliked it)", description: "Give 1 star" },
      ];
    } else if (factLower === "status") {
      // Bunko's own four statuses, spelled out as literals rather than
      // imported from domains/books/data/status.ts -- this file is "core"
      // (assistant-core-purity.spec.ts enforces no domain-pack imports
      // here), so an option's id/label is duplicated by hand instead of
      // referencing STATUS_LABEL directly. Each one must stay something
      // toStatus() can resolve, since that's what the execution layer
      // feeds it through.
      rawOptions = [
        { id: "Want to Read", label: "Want to Read", description: "Set status to Want to Read" },
        { id: "Reading", label: "Reading", description: "Set status to Reading" },
        { id: "Finished", label: "Finished", description: "Set status to Finished" },
        { id: "Did Not Finish", label: "Did Not Finish", description: "Set status to Did Not Finish" },
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
