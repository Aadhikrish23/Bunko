import { ExecutionConstants } from "./ExecutionConstants";

export type ExecutionStatus =
  | typeof ExecutionConstants.STATUS_PENDING
  | typeof ExecutionConstants.STATUS_RUNNING
  | typeof ExecutionConstants.STATUS_SUCCESS
  | typeof ExecutionConstants.STATUS_FAILED
  | typeof ExecutionConstants.STATUS_PARTIAL_SUCCESS
  | typeof ExecutionConstants.STATUS_SKIPPED
  | typeof ExecutionConstants.STATUS_CANCELLED;
