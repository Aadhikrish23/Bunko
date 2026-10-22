import { ClarificationType } from "./ClarificationType";
import { ClarificationOption } from "./ClarificationOption";

export interface ClarificationRequest {
  requestId: string;
  type: ClarificationType;
  reason: string;
  entityType: string;
  originalQuery: string;
  candidates: ClarificationOption[];

  // Phase 7 Clarification properties
  id?: string;
  question?: string;
  options?: ClarificationOption[];
  allowFreeText?: boolean;
  metadata?: Record<string, unknown>;
}

