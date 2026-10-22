import { ClarificationResponse } from "./ClarificationRuntime";
import { ClarificationRequest } from "../entity/ClarificationRequest";

export class ClarificationResponseBuilder {
  /**
   * Constructs an expired clarification session response.
   */
  buildExpired(): ClarificationResponse {
    return {
      success: false,
      message: "Clarification session expired due to inactivity. Please try your request again.",
    };
  }

  /**
   * Constructs a cancelled request response.
   */
  buildCancelled(): ClarificationResponse {
    return {
      success: false,
      message: "Request cancelled.",
    };
  }

  /**
   * Constructs a clarification retry request response.
   */
  buildRetry(request: string, originalRequest: ClarificationRequest): ClarificationResponse {
    const updatedClarification = { ...originalRequest };
    updatedClarification.question = `I couldn't resolve "${request}". Please choose one of the options:\n${updatedClarification.question}`;
    return {
      success: false,
      status: "CLARIFICATION_REQUIRED",
      message: updatedClarification.question,
      clarificationRequest: updatedClarification,
    };
  }

  /**
   * Constructs a max retries exceeded error response.
   */
  buildMaxRetriesExceeded(): ClarificationResponse {
    return {
      success: false,
      message: "Too many invalid attempts. Request cancelled.",
    };
  }
}

export default new ClarificationResponseBuilder();
