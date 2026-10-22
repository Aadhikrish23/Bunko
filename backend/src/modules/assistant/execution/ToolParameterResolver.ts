import { ExecutionContext } from "./ExecutionContext";
import { ExecutionPlan } from "./ExecutionPlan";
import toolMetadataRegistry from "./ToolMetadataRegistry";
import conversationStore from "../conversation/ConversationStore";
import { usesReferenceFallback } from "./NoReferenceFallbackTools";
import { domainPack } from "../domain/activeDomain";

/** "Text" is shared by several tools' free-text parameters; the pack says which key it becomes per tool. */
export function textParamKeyFor(toolName: string): string {
  const { textParamKeyByTool, defaultTextParamKey } = domainPack().tools;
  return textParamKeyByTool[toolName] || defaultTextParamKey;
}

export class ToolParameterResolver {
  /**
   * Automatically resolves missing step parameters based on precedence order.
   * Never overwrites explicitly supplied parameters.
   */
  async resolve(context: ExecutionContext): Promise<ExecutionPlan> {
    const planClone = JSON.parse(JSON.stringify(context.executionPlan)) as ExecutionPlan;
    const session = await conversationStore.get(context.userId);

    for (const step of planClone.steps) {
      const capability = toolMetadataRegistry.get(step.toolName);
      if (!capability || !capability.parameters) continue;

      const rawParameters = step.input.parameters;
      const parameters: Record<string, unknown> = {};

      // 1. Parse raw parameters array to object
      if (Array.isArray(rawParameters)) {
        for (const p of rawParameters) {
          if (p && typeof p === "object" && "type" in p && "value" in p) {
            const pType = String(p.type).toLowerCase();
            let key = pType;
            if (pType === "text") {
              key = textParamKeyFor(step.toolName);
            }
            parameters[key] = p.value;
          }
        }
      } else if (rawParameters && typeof rawParameters === "object") {
        Object.assign(parameters, rawParameters);
      }

      // 2. Resolve missing parameters
      const targets = (step.input.targets as any[]) || [];

      for (const param of capability.parameters) {
        if (
          parameters[param.name] !== undefined &&
          parameters[param.name] !== null &&
          parameters[param.name] !== ""
        ) {
          continue;
        }

        // A. Resolve bookId from Game target
        if (param.name === "bookId") {
          const bookTarget = targets.find((t) => t.type === "Book" || t.type?.toLowerCase() === "book");
          if (bookTarget) {
            const resolved = context.resolvedIntentPlan.resolvedTargets?.find(
              (r) => r.originalTarget.name === bookTarget.name
            );
            if (resolved && resolved.resolution?.status === "RESOLVED") {
              const ent = resolved.resolution.entity as any;
              parameters[param.name] = ent?._id?.toString() || resolved.originalTarget.name;
            }
          }
        }

        // B. Resolve collectionName/name from Collection target
        if (param.name === "collectionName" || param.name === "name") {
          const collectionTarget = targets.find((t) => t.type === "Collection" || t.type?.toLowerCase() === "collection");
          if (collectionTarget) {
            const resolved = context.resolvedIntentPlan.resolvedTargets?.find(
              (r) => r.originalTarget.name === collectionTarget.name
            );
            if (resolved && resolved.resolution?.status === "RESOLVED") {
              const ent = resolved.resolution.entity as any;
              parameters[param.name] = ent?.name || ent?.title || resolved.originalTarget.name;
            } else {
              parameters[param.name] = collectionTarget.name;
            }
          }
        }

        // C. Resolve bookName from a Library target (a search query for a game the
        // user doesn't own yet, not a resolved library entity -- take it as-is).
        if (param.name === "bookName") {
          const libraryTarget = targets.find((t) => t.type === "Library" || t.type?.toLowerCase() === "library");
          if (libraryTarget) {
            parameters[param.name] = libraryTarget.name;
          }
        }

        // If still not resolved, check session references
        if (
          (parameters[param.name] === undefined || parameters[param.name] === null || parameters[param.name] === "") &&
          usesReferenceFallback(step.toolName)
        ) {
          if (session && session.references) {
            if (param.name === "bookId" && session.references.currentBook) {
              parameters[param.name] = session.references.currentBook.entityId;
            } else if ((param.name === "collectionName" || param.name === "name") && session.references.currentCollection) {
              parameters[param.name] = session.references.currentCollection.displayName;
            } else if (param.name === "provider" && session.references.currentProvider) {
              parameters[param.name] = session.references.currentProvider.displayName;
            }
          }
        }

        // If still not resolved, check memory context
        if (parameters[param.name] === undefined || parameters[param.name] === null || parameters[param.name] === "") {
          if (context.memoryContext) {
            const prefs = context.memoryContext.preferences as Record<string, unknown> | undefined;
            const prefVal = prefs?.[param.name];
            if (prefVal) {
              parameters[param.name] = prefVal;
            }
          }
        }

        // If still not resolved, check execution candidates
        if (parameters[param.name] === undefined || parameters[param.name] === null || parameters[param.name] === "") {
          if (context.planningResult.executionCandidates) {
            for (const cand of context.planningResult.executionCandidates) {
              if (cand.parameters) {
                const matchedParam = cand.parameters.find(
                  (p) => String(p.type) === param.name || String(p.type).toLowerCase() === param.name.toLowerCase()
                );
                if (matchedParam && matchedParam.value !== undefined) {
                  parameters[param.name] = matchedParam.value;
                  break;
                }
              }
            }
          }
        }

        // If still not resolved, fallback to default value
        if (parameters[param.name] === undefined || parameters[param.name] === null || parameters[param.name] === "") {
          if (param.defaultValue !== undefined) {
            parameters[param.name] = param.defaultValue;
          }
        }
      }

      // Filter parameters to only allowed ones to prevent validation failures on extra/internal keys
      const allowedParams = new Set(capability.parameters.map((p) => p.name));
      const cleanParameters: Record<string, unknown> = {};
      for (const key of Object.keys(parameters)) {
        if (allowedParams.has(key)) {
          cleanParameters[key] = parameters[key];
        }
      }
      step.input.parameters = cleanParameters;
    }

    // Deduplicate steps to prevent validation failures on duplicate intents/actions
    const uniqueSteps: typeof planClone.steps = [];
    const seenKeys = new Set<string>();
    for (const step of planClone.steps) {
      const key = `${step.toolName}:${JSON.stringify(step.input)}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        uniqueSteps.push(step);
      }
    }
    planClone.steps = uniqueSteps;

    return planClone;
  }
}

export default new ToolParameterResolver();
