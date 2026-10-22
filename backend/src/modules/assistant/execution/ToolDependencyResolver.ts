import { ExecutionStep } from "./ExecutionStep";
import { ExecutionStepResult } from "./ExecutionStepResult";

export class ToolDependencyResolver {
  /**
   * Resolves dependencies in the execution plan steps by injecting previous step outputs.
   * Completely tool-agnostic.
   */
  resolve(step: ExecutionStep, previousResults: ExecutionStepResult[]): ExecutionStep {
    const stepClone = JSON.parse(JSON.stringify(step)) as ExecutionStep;
    const parameters = (stepClone.input.parameters as Record<string, unknown>) || {};

    for (const key of Object.keys(parameters)) {
      const val = parameters[key];
      if (typeof val === "string") {
        const match = val.match(/^\{\{step:([^:]+):?([^}]+)?\}\}$/);
        if (match) {
          const targetStepId = match[1];
          const propertyPath = match[2];

          const targetResult = previousResults.find((r) => r.stepId === targetStepId);
          if (targetResult && targetResult.status === "SUCCESS" && targetResult.output) {
            if (propertyPath) {
              const resolvedVal =
                targetResult.output[propertyPath] ||
                (targetResult.output.data as Record<string, unknown>)?.[propertyPath];
              if (resolvedVal !== undefined) {
                parameters[key] = resolvedVal;
              }
            } else {
              const resolvedVal =
                targetResult.output.id ||
                targetResult.output.gameId ||
                (targetResult.output.data as Record<string, unknown>)?.id;
              if (resolvedVal !== undefined) {
                parameters[key] = resolvedVal;
              }
            }
          }
        }
      }
    }

    stepClone.input.parameters = parameters;
    return stepClone;
  }
}

export default new ToolDependencyResolver();
