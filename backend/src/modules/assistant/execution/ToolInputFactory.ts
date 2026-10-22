import { ExecutionStep } from "./ExecutionStep";
import aiTraceLogger from "../debug/AITraceLogger";
import { domainPack } from "../domain/activeDomain";

export class ToolInputFactory {
  /**
   * Builds the concrete tool input payload from abstract targets and parameters.
   */
  createInput(step: ExecutionStep): Record<string, unknown> {
    const targets = (step.input.targets as any[]) || [];
    const parameters = step.input.parameters || {};
    const capabilityId = step.input.capabilityId as string;

    try {
      // The domain pack builds each tool's input; unknown tools get the raw targets and parameters.
      return domainPack().tools.buildInput(step) ?? { targets, parameters };
    } catch (error: any) {
      const trace = aiTraceLogger.current();
      if (trace) {
        trace.log("ToolInputFactory", "Mapping Exception details", {
          stepId: step.id,
          toolName: step.toolName,
          capabilityId,
          stepPayload: step.input,
          error: error.message || String(error),
        });
      }
      throw error;
    }
  }
}

export default new ToolInputFactory();
