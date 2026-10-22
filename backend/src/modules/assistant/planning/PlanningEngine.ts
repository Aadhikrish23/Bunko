import { ContextSnapshot } from "../context/ContextSnapshot";
import { PlanningResult } from "./PlanningResult";
import { PlanningStatus } from "./PlanningStatus";
import { ResolvedCapability } from "./ResolvedCapability";
import { ExecutionCandidate } from "./ExecutionCandidate";
import { ResolvedIntentPlan } from "../entity/ResolvedIntentPlan";
import aiTraceLogger from "../debug/AITraceLogger";
import toolMapper from "../execution/ToolMapper";
import toolMetadataRegistry from "../execution/ToolMetadataRegistry";
import { ConversationReferences } from "../conversation/ConversationReferences";
import { ContextCategory } from "../context/ContextCategory";
import { usesReferenceFallback } from "../execution/NoReferenceFallbackTools";

// The prompt instructs the LLM not to invent a placeholder name when the user
// didn't give one, but that's a probabilistic instruction, not a guarantee --
// live testing found it still happens (e.g. "Create Collection" -> a target
// literally named "Collection"). A target whose name is just the entity's own
// category word (or the action verb itself) is treated as not really supplied,
// so it falls through to a clarification instead of acting on a placeholder.
const GENERIC_PLACEHOLDER_NAMES = new Set([
  "book", "collection", "library",
  "launch", "create", "add", "remove", "search", "complete", "rate", "review", "delete",
]);

// Which IntentParameterType (lowercased) supplies which tool parameter (lowercased).
export const INTENT_PARAM_TYPE_BY_TOOL_PARAM: Record<string, string> = {
  rating: "rating",
  status: "status",
  reviewtext: "text",
  platform: "platform",
  provider: "provider",
  searchvalue: "text",
  content: "text",
  query: "text",
  question: "text",
};

// Tool parameters (lowercased) supplied from the intent's targets instead.
export const TARGET_SUPPLIED_TOOL_PARAMS = new Set(["bookid", "collectionname", "name", "bookname"]);

function isMeaningfulTargetName(name: unknown): boolean {
  return typeof name === "string" && name.trim() !== "" && !GENERIC_PLACEHOLDER_NAMES.has(name.trim().toLowerCase());
}

export class PlanningEngine {
  /**
   * Evaluates resolved capabilities, gathered context snapshot, and resolved intent plan to produce a PlanningResult.
   */
  async plan(
    resolvedCapabilities: ResolvedCapability[],
    contextSnapshot: ContextSnapshot,
    resolvedIntentPlan: ResolvedIntentPlan,
    conversationReferences?: ConversationReferences,
    userQuery?: string,
  ): Promise<PlanningResult> {
    const trace = aiTraceLogger.current();
    const startTime = Date.now();

    try {
      if (resolvedCapabilities.length === 0) {
        const failedResult = {
          status: PlanningStatus.FAILED,
          explanation: "No resolved capabilities matched the user's intent.",
          executionCandidates: [],
          missingFacts: [],
          suggestions: ["Try rephrasing your request."],
        };

        if (trace) {
          const elapsed = Date.now() - startTime;
          trace.log("PlanningEngine", "Planning Completed", failedResult, elapsed);
        }

        return failedResult;
      }

      // Check if clarification is required from already-resolved entities
      if (resolvedIntentPlan.clarificationRequests.length > 0) {
        const clarificationRequest = resolvedIntentPlan.clarificationRequests[0]!;

        const clarificationResult: PlanningResult = {
          status: PlanningStatus.CLARIFICATION_REQUIRED,
          explanation: `Ambiguous entity resolution for: "${clarificationRequest.originalQuery}"`,
          executionCandidates: [],
          missingFacts: [],
          suggestions: ["Please clarify which option you meant."],
          clarificationRequest,
        };

        if (trace) {
          const elapsed = Date.now() - startTime;
          trace.log("PlanningEngine", "Planning Completed (Clarification Required)", clarificationResult, elapsed);
        }

        return clarificationResult;
      }

      const executionCandidates: ExecutionCandidate[] = [];
      const missingFactsSet = new Set<string>();

      for (const resolved of resolvedCapabilities) {
        // Internal context categories (Library, PlaySessions, etc.) are system-owned.
        // They must never generate clarification requests, and we use them as-is (even if empty).
        // Therefore, we do not add req.contextCategory to missingFactsSet anymore.

        // Resolve missing required user-supplied parameters
        try {
          const toolName = toolMapper.mapCapabilityToTool(
            resolved.capability.id,
            { targets: resolved.intent.targets, parameters: resolved.intent.parameters },
            userQuery || resolved.intent.type
          );
          const toolMeta = toolMetadataRegistry.get(toolName);
          if (toolMeta && toolMeta.parameters) {
            for (const param of toolMeta.parameters) {
              if (param.required) {
                let isSupplied = false;
                const paramNameLower = param.name.toLowerCase();

                // A. Check intent parameters
                if (resolved.intent.parameters) {
                  const matched = resolved.intent.parameters.find(p => {
                    return INTENT_PARAM_TYPE_BY_TOOL_PARAM[paramNameLower] === p.type.toLowerCase();
                  });
                  if (matched && matched.value !== undefined && matched.value !== null && matched.value !== "") {
                    isSupplied = true;
                  }
                }

                // B. Check intent targets
                if (!isSupplied && resolved.intent.targets) {
                  if (paramNameLower === "bookid") {
                    isSupplied = resolved.intent.targets.some(t => t.type === "Book" && isMeaningfulTargetName(t.name));
                  } else if (paramNameLower === "collectionname" || paramNameLower === "name") {
                    isSupplied = resolved.intent.targets.some(t => t.type === "Collection" && isMeaningfulTargetName(t.name));
                  } else if (paramNameLower === "bookname") {
                    isSupplied = resolved.intent.targets.some(t => t.type === "Library" && isMeaningfulTargetName(t.name));
                  }
                }

                // C. Check conversation references (skipped for tools that must not
                // silently act on a stale reference -- see NoReferenceFallbackTools)
                if (!isSupplied && conversationReferences && usesReferenceFallback(toolName)) {
                  if (paramNameLower === "bookid" && conversationReferences.currentBook) {
                    isSupplied = true;
                  } else if (paramNameLower === "collectionname" && conversationReferences.currentCollection) {
                    isSupplied = true;
                  } else if (paramNameLower === "provider" && conversationReferences.currentProvider) {
                    isSupplied = true;
                  }
                }

                // D. Check memory defaults / preferences
                if (!isSupplied && contextSnapshot && contextSnapshot.facts) {
                  const prefFacts = contextSnapshot.facts[ContextCategory.Preferences] || [];
                  const foundPref = prefFacts.find(
                    (f: any) => f.name?.toLowerCase() === paramNameLower || f.key?.toLowerCase() === paramNameLower
                  );
                  if (foundPref && foundPref.value !== undefined) {
                    isSupplied = true;
                  }
                }

                // E. Check default values
                if (!isSupplied && param.defaultValue !== undefined) {
                  isSupplied = true;
                }

                if (!isSupplied) {
                  if (paramNameLower === "bookid") {
                    missingFactsSet.add("book");
                  } else if (paramNameLower === "collectionname" || paramNameLower === "name") {
                    missingFactsSet.add("collection");
                  } else {
                    missingFactsSet.add(param.name);
                  }
                }
              }
            }
          }
        } catch (err) {
          // Fail silently on capability mapping
        }

        const bulkTarget = resolved.intent.targets?.find(t => {
          const rt = resolvedIntentPlan.resolvedTargets?.find((r: any) => r.originalTarget.name === t.name);
          return rt && (rt as any).isBulk;
        });

        if (bulkTarget) {
          const rt = resolvedIntentPlan.resolvedTargets.find((r: any) => r.originalTarget.name === bulkTarget.name)!;
          const candidates = rt.resolution.candidates || [];
          for (const cand of candidates) {
            const newTargets = resolved.intent.targets.map(t => {
              if (t.name === bulkTarget.name) {
                return { ...t, name: (cand as any).title || (cand as any).name };
              }
              return t;
            });
            executionCandidates.push({
              capability: resolved.capability,
              targets: newTargets,
              parameters: resolved.intent.parameters,
            });
          }
        } else {
          executionCandidates.push({
            capability: resolved.capability,
            targets: resolved.intent.targets,
            parameters: resolved.intent.parameters,
          });
        }
      }

      const missingFacts = Array.from(missingFactsSet);

      if (missingFacts.length > 0) {
        const partiallyResolvedResult = {
          status: PlanningStatus.PARTIALLY_RESOLVED,
          explanation: "Some capabilities lack required user-supplied parameters.",
          executionCandidates,
          missingFacts,
          suggestions: ["Additional information is required."],
        };

        if (trace) {
          const elapsed = Date.now() - startTime;
          trace.log("PlanningEngine", "Planning Completed", partiallyResolvedResult, elapsed);
        }

        return partiallyResolvedResult;
      }

      const readyResult = {
        status: PlanningStatus.READY,
        explanation: "All capability requirements met and ready for execution.",
        executionCandidates,
        missingFacts: [],
        suggestions: ["Ready for execution."],
      };

      if (trace) {
        const elapsed = Date.now() - startTime;
        trace.log("PlanningEngine", "Planning Completed", readyResult, elapsed);
      }

      return readyResult;
    } catch (error) {
      if (trace) {
        trace.error("PlanningEngine", error);
      }
      throw error;
    }
  }
}

export default new PlanningEngine();
