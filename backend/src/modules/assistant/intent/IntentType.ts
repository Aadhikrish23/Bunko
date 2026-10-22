/**
 * Intent types are strings the domain pack defines (domains/games/intent/IntentType for RoninArc).
 * The core handles only these two itself: a question to answer and a request for help.
 */
export type IntentType = string;

export const CoreIntentType = {
  AskQuestion: "AskQuestion",
  Help: "Help",
} as const;
