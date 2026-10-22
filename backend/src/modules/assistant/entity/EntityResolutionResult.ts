import { EntityResolutionStatus } from "./EntityResolutionStatus";

export interface EntityResolutionResult<T> {
  status: EntityResolutionStatus;
  confidence: number;
  entity?: T;
  candidates?: T[];
  reasoning?: string;
}
