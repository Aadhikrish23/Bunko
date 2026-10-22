import { ContextCategory } from "./ContextCategory";

export interface ContextFact {
  readonly category: ContextCategory;
  readonly value: unknown;
  readonly confidence: number;
  readonly source: string;
  readonly timestamp: Date;
}
