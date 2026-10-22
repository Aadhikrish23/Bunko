import { ContextCategory } from "./ContextCategory";
import { ContextFact } from "./ContextFact";

export interface ContextResult {
  category: ContextCategory;
  facts: ContextFact[];
}
