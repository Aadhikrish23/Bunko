import { ExecutionStatus } from "./ExecutionStatus";
import { ExecutionStepResult } from "./ExecutionStepResult";

export interface ExecutionResult {
  executionId: string;
  status: ExecutionStatus;
  startedAt: Date;
  finishedAt?: Date;
  steps: ExecutionStepResult[];
  summary: string;
  errors: string[];
  warnings: string[];
}
