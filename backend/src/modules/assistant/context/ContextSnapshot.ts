import { ContextCategory } from "./ContextCategory";
import { ContextFact } from "./ContextFact";

export interface ContextSnapshot {
  readonly requestId: string;
  readonly timestamp: Date;
  readonly facts: Readonly<Partial<Record<ContextCategory, ContextFact[]>>>;
}
