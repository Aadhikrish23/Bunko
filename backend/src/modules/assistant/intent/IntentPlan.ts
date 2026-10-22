import { AIIntent } from "./AIIntent";

export interface IntentPlan {
  id: string;
  requestId: string;
  intents: AIIntent[];
  reasoning?: string;
}
