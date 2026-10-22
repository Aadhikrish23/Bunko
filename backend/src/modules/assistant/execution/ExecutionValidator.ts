import { ExecutionPlan } from "./ExecutionPlan";
import { ResolvedIntentPlan } from "../entity/ResolvedIntentPlan";
import { AIToolRegistry } from "../sdk/AIToolRegistry";
import { EntityResolutionStatus } from "../entity/EntityResolutionStatus";
import { IntentTargetType } from "../intent/IntentTargetType";
import toolMapper from "./ToolMapper";

export class ExecutionValidator {
  constructor(private readonly registry: AIToolRegistry) {}

  /**
   * Verifies the plan, resolved intents, inputs, and ordering constraints before execution starts.
   */
  validate(executionPlan: ExecutionPlan, resolvedIntentPlan: ResolvedIntentPlan): string[] {
    const errors: string[] = [];

    // 1. Empty plan check
    if (!executionPlan.steps || executionPlan.steps.length === 0) {
      errors.push("Validation failed: Empty execution plan.");
      return errors;
    }

    // 2. Duplicate steps check
    const stepKeys = new Set<string>();
    for (const step of executionPlan.steps) {
      const key = `${step.toolName}:${JSON.stringify(step.input)}`;
      if (stepKeys.has(key)) {
        errors.push(`Validation failed: Duplicate execution step detected: tool "${step.toolName}" with inputs ${JSON.stringify(step.input)}.`);
      }
      stepKeys.add(key);
    }

    // 3. Validation for individual steps
    for (let i = 0; i < executionPlan.steps.length; i++) {
      const step = executionPlan.steps[i]!;
      const stepIndex = i + 1;

      // A. Tool exists
      const toolName = step.toolName || toolMapper.mapCapabilityToTool(step.input.capabilityId as string);
      const tool = this.registry.get(toolName);
      if (!tool) {
        errors.push(`Validation failed: Tool "${toolName}" for step ${stepIndex} is not registered.`);
        continue;
      }

      // B. Required inputs exist
      const rawInput = step.input;
      if (!rawInput) {
        errors.push(`Validation failed: Step ${stepIndex} has missing input parameters.`);
        continue;
      }

      // C. Resolved entity IDs exist
      const targets = rawInput.targets as any[];
      if (targets) {
        for (const target of targets) {
          if (target.type === IntentTargetType.Book) {
            const rt = resolvedIntentPlan.resolvedTargets?.find(
              (r) => r.originalTarget.name === target.name
            );
            if (rt) {
              if (rt.resolution.status === EntityResolutionStatus.AMBIGUOUS) {
                errors.push(`Validation failed: Ambiguous book selection: "${target.name}".`);
              } else if (rt.resolution.status === EntityResolutionStatus.NOT_FOUND) {
                errors.push(`Validation failed: Book "${target.name}" not found.`);
              }
            } else {
              errors.push(`Validation failed: Target book "${target.name}" has no resolution record.`);
            }
          }
        }
      }
    }

    return errors;
  }
}
