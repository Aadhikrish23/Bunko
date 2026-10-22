import { ExecutionStatus } from "./ExecutionStatus";

export interface ExecutionStepResult {
  stepId: string;
  tool: string;
  status: ExecutionStatus;
  duration: number;
  input: Record<string, unknown>;
  output?: Record<string, unknown> | null;
  error?: string | null;
  warnings?: string[];
  retryCount: number;
}
