import { ContextCategory } from "../context/ContextCategory";

export interface CapabilityRequirement {
  contextCategory?: ContextCategory;
  requiredFact?: string;
  confidenceThreshold?: number;
  attributes?: Record<string, unknown>;
}
