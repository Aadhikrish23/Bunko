import { PlanningStatus } from "./PlanningStatus";
import { ExecutionCandidate } from "./ExecutionCandidate";
import { ClarificationRequest } from "../entity/ClarificationRequest";

export interface PlanningResult {
  status: PlanningStatus;
  explanation: string;
  executionCandidates: ExecutionCandidate[];
  missingFacts: string[];
  clarification?: string;
  clarificationRequest?: ClarificationRequest;
  suggestions: string[];
}
