import { PlanningResult } from "../planning/PlanningResult";
import { ClarificationRequest } from "../entity/ClarificationRequest";
import ambiguousEntityClarificationBuilder from "./builders/AmbiguousEntityClarificationBuilder";
import missingParameterClarificationBuilder from "./builders/MissingParameterClarificationBuilder";
import confirmationClarificationBuilder from "./builders/ConfirmationClarificationBuilder";

export class ClarificationBuilder {
  /**
   * Delegates clarification building to specialized builders.
   */
  build(planningResult: PlanningResult, userId: string): ClarificationRequest | null {
    const ambiguousReq = ambiguousEntityClarificationBuilder.build(planningResult, userId);
    if (ambiguousReq) return ambiguousReq;

    const missingParamReq = missingParameterClarificationBuilder.build(planningResult, userId);
    if (missingParamReq) return missingParamReq;

    const confirmationReq = confirmationClarificationBuilder.build(planningResult, userId);
    if (confirmationReq) return confirmationReq;

    return null;
  }
}

export default new ClarificationBuilder();
