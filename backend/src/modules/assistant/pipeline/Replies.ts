
/** What the runtime returns to the controller. */
export type RuntimeResponse = Record<string, any> & { success: boolean; message: string; status?: string };

/** A yes/no card: removing an item, deleting a collection. */
export function confirmationResponse(
  requestId: string,
  originalQuery: string,
  question: string,
  yesLabel: string,
  reason = "This can't be undone.",
): RuntimeResponse {
  const options = [
    { id: "confirm-yes", label: yesLabel },
    { id: "confirm-no", label: "No, keep it" },
  ];
  return {
    success: false,
    status: "CONFIRMATION_REQUIRED",
    message: question,
    clarificationRequest: {
      id: requestId,
      requestId,
      type: "CONFIRMATION",
      question,
      reason,
      entityType: "confirmation",
      originalQuery,
      candidates: options,
      options,
      allowFreeText: false,
    },
  };
}
