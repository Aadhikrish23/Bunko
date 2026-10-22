import { ExecutionPlan } from "./ExecutionPlan";
import { ExecutionStep } from "./ExecutionStep";
import { ResolvedIntentPlan } from "../entity/ResolvedIntentPlan";
import toolMetadataRegistry from "./ToolMetadataRegistry";
import { AIToolRegistry } from "../sdk/AIToolRegistry";

export class ToolValidator {
  constructor(private readonly registry: AIToolRegistry) {}

  /**
   * Asserts parameters, capabilities, types, and dependency structures before starting execution.
   */
  validate(executionPlan: ExecutionPlan, resolvedIntentPlan: ResolvedIntentPlan): string[] {
    const errors: string[] = [];

    if (!executionPlan.steps || executionPlan.steps.length === 0) {
      errors.push("Validation failed: Empty execution plan.");
      return errors;
    }

    const stepIds = new Set<string>();
    const capabilityIds = new Set<string>();

    for (const step of executionPlan.steps) {
      if (stepIds.has(step.id)) {
        errors.push(`Validation failed: Duplicate step ID "${step.id}" in the plan.`);
      }
      stepIds.add(step.id);

      const capId = step.input.capabilityId as string;
      if (capId) {
        if (capabilityIds.has(capId)) {
          const capability = toolMetadataRegistry.get(step.toolName);
          if (capability && capability.executionPolicy === "EXCLUSIVE") {
            errors.push(`Validation failed: Duplicate execution of EXCLUSIVE capability "${capId}".`);
          }
        }
        capabilityIds.add(capId);
      }
    }

    const hasCycles = this.detectCyclicDependencies(executionPlan.steps, errors);
    if (hasCycles) {
      errors.push("Validation failed: Cyclic dependencies detected in the execution graph.");
    }

    const seenStepKeys = new Set<string>();

    for (let i = 0; i < executionPlan.steps.length; i++) {
      const step = executionPlan.steps[i]!;
      const stepIndex = i + 1;

      const capability = toolMetadataRegistry.get(step.toolName);
      if (!capability) {
        errors.push(`Validation failed: Mapped tool capability "${step.toolName}" is not registered in metadata.`);
        continue;
      }

      const tool = this.registry.get(step.toolName);
      if (!tool) {
        errors.push(`Validation failed: Tool "${step.toolName}" is not registered in the low-level registry.`);
        continue;
      }

      // Check if any target in the step is unresolved
      let hasUnresolvedTarget = false;
      const targets = (step.input.targets as any[]) || [];
      for (const target of targets) {
        const resolved = resolvedIntentPlan.resolvedTargets?.find(
          (r) => r.originalTarget.name === target.name && r.originalTarget.type === target.type
        );
        if (resolved && resolved.resolution?.status !== "RESOLVED") {
          if (target.type === "Book") {
            errors.push(`I couldn't find "${target.name}" in your library. Say "add ${target.name}" if you want me to add it.`);
          } else {
            errors.push(`Entity target "${target.name}" of type "${target.type}" could not be resolved.`);
          }
          hasUnresolvedTarget = true;
        }
      }
      if (hasUnresolvedTarget) {
        continue;
      }

      const rawInput = step.input;
      if (!rawInput || Object.keys(rawInput).length === 0) {
        errors.push("Validation failed: Step has empty execution input.");
        continue;
      }

      const duplicateKey = `${step.toolName}:${JSON.stringify(rawInput)}`;
      if (seenStepKeys.has(duplicateKey)) {
        errors.push(`Validation failed: Duplicate execution step detected: tool "${step.toolName}" with inputs ${JSON.stringify(rawInput)}.`);
      }
      seenStepKeys.add(duplicateKey);

      const parameters = (rawInput.parameters as Record<string, unknown>) || {};
      const allowedParams = new Set(capability.parameters?.map((p) => p.name) || []);
      for (const key of Object.keys(parameters)) {
        if (!allowedParams.has(key)) {
          errors.push(`Validation failed: Step ${stepIndex} (${step.toolName}) has invalid parameter mapping "${key}".`);
        }
      }

      if (capability.parameters) {
        for (const param of capability.parameters) {
          const val = parameters[param.name];
          if (param.required && (val === undefined || val === null || val === "")) {
            errors.push(`Validation failed: Step ${stepIndex} (${step.toolName}) is missing required parameter "${param.name}".`);
          } else if (val !== undefined && val !== null) {
            const typeOfVal = typeof val;
            if (typeof val === "string" && val.startsWith("{{step:")) {
              continue;
            }

            if (param.type === "number" && typeOfVal !== "number") {
              errors.push(`Validation failed: Step ${stepIndex} (${step.toolName}) parameter "${param.name}" type mismatch. Expected number, got ${typeOfVal}.`);
            } else if (param.type === "string" && typeOfVal !== "string") {
              errors.push(`Validation failed: Step ${stepIndex} (${step.toolName}) parameter "${param.name}" type mismatch. Expected string, got ${typeOfVal}.`);
            } else if (param.type === "boolean" && typeOfVal !== "boolean") {
              errors.push(`Validation failed: Step ${stepIndex} (${step.toolName}) parameter "${param.name}" type mismatch. Expected boolean, got ${typeOfVal}.`);
            }
          }
        }
      }
    }

    return errors;
  }

  private detectCyclicDependencies(steps: ExecutionStep[], errors: string[]): boolean {
    const adj = new Map<string, string[]>();
    const allStepIds = new Set(steps.map((s) => s.id));

    for (const step of steps) {
      const deps: string[] = [];
      const parameters = (step.input.parameters as Record<string, unknown>) || {};
      for (const val of Object.values(parameters)) {
        if (typeof val === "string") {
          const match = val.match(/^\{\{step:([^:]+):?([^}]+)?\}\}$/);
          if (match) {
            const depId = match[1]!;
            if (!allStepIds.has(depId)) {
              errors.push(`Validation failed: Step "${step.id}" references non-existent step dependency "${depId}".`);
            } else {
              deps.push(depId);
            }
          }
        }
      }
      adj.set(step.id, deps);
    }

    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (node: string): boolean => {
      if (recStack.has(node)) return true;
      if (visited.has(node)) return false;

      visited.add(node);
      recStack.add(node);

      const neighbors = adj.get(node) || [];
      for (const neighbor of neighbors) {
        if (dfs(neighbor)) return true;
      }

      recStack.delete(node);
      return false;
    };

    for (const step of steps) {
      if (dfs(step.id)) return true;
    }
    return false;
  }
}
export default ToolValidator;
