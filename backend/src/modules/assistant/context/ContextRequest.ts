import { ContextCategory } from "./ContextCategory";
import { IntentTarget } from "../intent/IntentTarget";

export interface ContextRequest {
  requestId: string;
  userId: string;
  requiredCategories: ContextCategory[];
  targets: IntentTarget[];
}
