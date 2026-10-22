import { CapabilityRegistry } from "../planning/CapabilityRegistry";
import { ToolRegistry } from "./ToolRegistry";
import { ToolMapper } from "../execution/ToolMapper";
import { ToolMetadataRegistry } from "../execution/ToolMetadataRegistry";
import { domainPack } from "../domain/activeDomain";
import {
  INTENT_PARAM_TYPE_BY_TOOL_PARAM,
  TARGET_SUPPLIED_TOOL_PARAMS,
} from "../planning/PlanningEngine";
import {
  textParamKeyFor,
} from "../execution/ToolParameterResolver";
import { coreLog } from "../logging/coreLog";

export interface ConsistencyReport {
  /** Wiring that will break a request at runtime. */
  errors: string[];
  /** Dead or orphaned entries; harmless but usually a leftover. */
  warnings: string[];
}

/**
 * Adding an AI tool means editing several hand-synced tables (capabilities,
 * ToolMapper, ToolMetadataRegistry, ToolRegistry, the planner's parameter table,
 * the parameter resolver's text-key table). Nothing used to notice when one was
 * forgotten -- the failure only showed up as a confusing runtime error. This
 * verifies they agree. Pure: takes the registries so it can be tested directly.
 */
export function checkRegistryConsistency(
  capabilities: CapabilityRegistry,
  tools: ToolRegistry,
  mapper: ToolMapper,
  metadata: ToolMetadataRegistry,
): ConsistencyReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const validIntents = new Set<string>(domainPack().intentTypes);
  const reachableTools = new Set<string>();

  for (const cap of capabilities.list()) {
    if (!validIntents.has(cap.intentType)) {
      errors.push(`Capability "${cap.id}" has unknown intentType "${cap.intentType}".`);
    }

    const toolNames = mapper.possibleToolsFor(cap.id);
    if (toolNames.length === 0) {
      errors.push(`Capability "${cap.id}" has no tool mapping in ToolMapper.`);
    }

    for (const toolName of toolNames) {
      reachableTools.add(toolName);
      if (!tools.exists(toolName)) {
        errors.push(`Capability "${cap.id}" maps to tool "${toolName}", which is not registered in ToolRegistry.`);
      }
      if (!metadata.get(toolName)) {
        errors.push(
          `Tool "${toolName}" (capability "${cap.id}") has no ToolMetadataRegistry entry -- its parameters would never be resolved or checked.`,
        );
      }
    }
  }

  for (const meta of metadata.list()) {
    for (const param of meta.parameters ?? []) {
      const key = param.name.toLowerCase();
      const plannerType = INTENT_PARAM_TYPE_BY_TOOL_PARAM[key];

      if (param.required && param.defaultValue === undefined && !plannerType && !TARGET_SUPPLIED_TOOL_PARAMS.has(key)) {
        errors.push(
          `Tool "${meta.id}" requires "${param.name}", but PlanningEngine has no way to treat it as supplied -- it would always trigger a clarification.`,
        );
      }

      if (plannerType === "text") {
        const resolvedKey = textParamKeyFor(meta.id);
        if (resolvedKey.toLowerCase() !== key) {
          errors.push(
            `Tool "${meta.id}" has free-text parameter "${param.name}", but ToolParameterResolver routes Text to "${resolvedKey}" for it (add it to the pack's textParamKeyByTool).`,
          );
        }
      }
    }
  }

  for (const tool of tools.list()) {
    if (!reachableTools.has(tool.name)) {
      warnings.push(`Tool "${tool.name}" is registered but no capability can reach it.`);
    }
    if (!metadata.get(tool.name)) {
      warnings.push(`Tool "${tool.name}" is registered but has no ToolMetadataRegistry entry.`);
    }
  }

  for (const meta of metadata.list()) {
    if (!tools.exists(meta.id)) {
      warnings.push(`ToolMetadataRegistry has "${meta.id}" but no such tool is registered.`);
    }
  }

  return { errors, warnings };
}

/**
 * Startup wrapper. Logs rather than throws: a wiring slip in one AI tool must not
 * take down auth/library/everything else (same lesson as AIConfig).
 */
export function reportRegistryConsistency(report: ConsistencyReport): void {
  if (report.errors.length === 0 && report.warnings.length === 0) {
    coreLog.debug("[AI] Registry consistency check passed.");
    return;
  }
  if (report.errors.length > 0) {
    coreLog.error(
      `[AI] Registry consistency check found ${report.errors.length} error(s):\n  - ${report.errors.join("\n  - ")}`,
    );
  }
  if (report.warnings.length > 0) {
    coreLog.warn(
      `[AI] Registry consistency check found ${report.warnings.length} warning(s):\n  - ${report.warnings.join("\n  - ")}`,
    );
  }
}
