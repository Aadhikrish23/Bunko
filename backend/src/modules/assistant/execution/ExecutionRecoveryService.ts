import { ExecutionStep } from "./ExecutionStep";
import executionRetryPolicy from "./ExecutionRetryPolicy";

export type ExecutionRecoveryAction = "RETRY" | "CONTINUE" | "ABORT" | "SKIP";

export class ExecutionRecoveryService {
  /**
   * Identifies if a tool step is critical.
   */
  isCritical(step: ExecutionStep): boolean {
    const criticalTools = ["launch_game", "install_game", "LaunchGameTool", "startGame", "InstallGameTool", "installGame"];
    return criticalTools.includes(step.toolName);
  }

  /**
   * Chooses the explicit recovery action when a step encounters an error.
   */
  async attemptRecovery(
    step: ExecutionStep,
    error: any,
    attemptCount: number
  ): Promise<ExecutionRecoveryAction> {
    if (executionRetryPolicy.isRetryable(error) && attemptCount < executionRetryPolicy.MAX_RETRIES) {
      return "RETRY";
    }

    if (!this.isCritical(step)) {
      return "CONTINUE";
    }

    return "ABORT";
  }
}

export default new ExecutionRecoveryService();
