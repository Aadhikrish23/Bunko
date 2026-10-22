import { AIExecutor } from "../sdk/AIExecutor";
import { AIToolContext } from "../sdk/AIToolContext";
import { AIToolRegistry } from "../sdk/AIToolRegistry";
import { AIToolResult } from "../sdk/AIToolResult";
import { AIPlan } from "../types/AIPlan";
import aiTraceLogger from "../debug/AITraceLogger";

export class ActionExecutor implements AIExecutor {
  constructor(private readonly registry: AIToolRegistry) {}

  async execute(
    plan: AIPlan,
    context: AIToolContext
  ): Promise<AIToolResult[]> {
    const trace = aiTraceLogger.current();
    const executorStartTime = Date.now();

    if (trace) {
      trace.log("ActionExecutor", "Execution Started", { planId: plan.id });
      trace.updateStats({
        executionStepsCount: plan.steps.length,
      });
    }

    const results: AIToolResult[] = [];

    try {
      for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i]!;
        const stepIndex = i + 1;
        const stepStartTime = Date.now();

        const tool = this.registry.get(step.tool);
        const rawInput = { ...step.input };
        const capabilityId = rawInput._capabilityId || "unknown";
        delete rawInput._capabilityId;

        if (!tool) {
          const result = {
            success: false,
            error: `Tool "${step.tool}" is not registered.`,
          };
          
          if (trace) {
            const duration = Date.now() - stepStartTime;
            trace.log(
              "ActionExecutor",
              `Execution Step`,
              {
                stepNumber: stepIndex,
                capability: capabilityId,
                mappedTool: step.tool,
                input: rawInput,
                result: "Failed: Tool not registered.",
              },
              duration
            );
          }

          results.push(result);
          continue;
        }

        try {
          const result = await tool.execute(rawInput, context);
          
          if (trace) {
            const duration = Date.now() - stepStartTime;
            trace.log(
              "ActionExecutor",
              `Execution Step`,
              {
                stepNumber: stepIndex,
                capability: capabilityId,
                mappedTool: tool.name,
                input: rawInput,
                result: result.success ? "Success" : "Failed",
                details: result,
              },
              duration
            );
          }

          results.push(result);
        } catch (error: any) {
          if (trace) {
            const duration = Date.now() - stepStartTime;
            trace.log(
              "ActionExecutor",
              `Execution Step (Exception)`,
              {
                stepNumber: stepIndex,
                capability: capabilityId,
                mappedTool: tool.name,
                input: rawInput,
                exception: error.message || String(error),
              },
              duration
            );
          }
          throw error;
        }
      }

      if (trace) {
        const elapsed = Date.now() - executorStartTime;
        trace.log(
          "ActionExecutor",
          "Execution Finished",
          { planId: plan.id, resultsCount: results.length },
          elapsed
        );
      }

      return results;
    } catch (error) {
      if (trace) {
        trace.error("ActionExecutor", error);
      }
      throw error;
    }
  }
}