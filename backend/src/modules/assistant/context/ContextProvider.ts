import { ContextCategory } from "./ContextCategory";
import { ContextRequest } from "./ContextRequest";
import { ContextResult } from "./ContextResult";

export interface ContextProvider {
  readonly category: ContextCategory;
  build(request: ContextRequest): Promise<ContextResult>;
}
