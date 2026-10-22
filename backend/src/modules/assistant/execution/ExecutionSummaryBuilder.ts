import { ExecutionResult } from "./ExecutionResult";
import { ExecutionConstants } from "./ExecutionConstants";

export class ExecutionSummaryBuilder {
  /**
   * Generates a user-facing semantic summary of the execution outcome consuming only the ExecutionResult.
   */
  build(result: ExecutionResult): string {
    if (!result.steps || result.steps.length === 0) {
      return "Execution finished with no steps run.";
    }

    const totalSteps = result.steps.length;
    const succeeded = result.steps.filter((s) => s.status === ExecutionConstants.STATUS_SUCCESS).length;
    const failed = result.steps.filter((s) => s.status === ExecutionConstants.STATUS_FAILED).length;

    const stepSummaries = result.steps.map((s) => {
      if (s.status === ExecutionConstants.STATUS_SUCCESS) {
        return `Step "${s.tool}" succeeded.`;
      }
      return `Step "${s.tool}" failed${s.error ? `: ${s.error}` : "."}`;
    });

    if (result.status === ExecutionConstants.STATUS_SUCCESS) {
      return `Execution completed successfully. All ${totalSteps} steps completed. ${stepSummaries.join(" ")}`;
    }

    if (result.status === ExecutionConstants.STATUS_PARTIAL_SUCCESS) {
      return `Execution partially completed. Succeeded steps: ${succeeded}, failed steps: ${failed}. ${stepSummaries.join(" ")}`;
    }

    // One step that failed with a reason: the reason is the whole answer
    // ("I couldn't find a game called ..."), not "Step "add_game" failed: ...".
    if (totalSteps === 1 && result.steps[0]!.error) {
      return result.steps[0]!.error;
    }

    return `Execution failed. ${stepSummaries.join(" ")}`;
  }
}

export default new ExecutionSummaryBuilder();
