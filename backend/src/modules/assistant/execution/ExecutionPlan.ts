import { ExecutionStep } from "./ExecutionStep";

export interface ExecutionPlan {
  id: string;
  steps: ExecutionStep[];
}
