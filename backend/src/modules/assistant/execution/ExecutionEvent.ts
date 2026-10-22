import { ExecutionConstants } from "./ExecutionConstants";

export type ExecutionEvent =
  | typeof ExecutionConstants.EVENT_STARTED
  | typeof ExecutionConstants.EVENT_VALIDATED
  | typeof ExecutionConstants.EVENT_STEP_STARTED
  | typeof ExecutionConstants.EVENT_STEP_FINISHED
  | typeof ExecutionConstants.EVENT_STEP_FAILED
  | typeof ExecutionConstants.EVENT_STEP_RETRIED
  | typeof ExecutionConstants.EVENT_FINISHED
  | typeof ExecutionConstants.EVENT_FAILED;
