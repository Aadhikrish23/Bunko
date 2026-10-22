import { ResolvedCapability } from "../planning/ResolvedCapability";
import { ResolvedIntentPlan } from "./ResolvedIntentPlan";
import { ResolvedIntent } from "./ResolvedIntent";
import { ResolvedTarget } from "./ResolvedTarget";
import { ClarificationRequest } from "./ClarificationRequest";
import { ClarificationType } from "./ClarificationType";
import { EntityResolutionStatus } from "./EntityResolutionStatus";
import { IntentTargetType } from "../intent/IntentTargetType";
import { domainPack } from "../domain/activeDomain";
import { IntentTarget } from "../intent/IntentTarget";
import aiTraceLogger from "../debug/AITraceLogger";

function getBulkQueryInfo(targetName: string): { isBulk: boolean; cleanQuery: string } {
  const nameLower = targetName.toLowerCase().trim();
  
  if (nameLower.startsWith("all ") || nameLower.startsWith("every ")) {
    let query = nameLower.replace(/^(all|every)\s+/, "");
    query = query.replace(/\s+games?(\s+in\s+library)?$/, "");
    return { isBulk: true, cleanQuery: query.trim() };
  }
  
  if (nameLower.endsWith(" games") || nameLower.endsWith(" game")) {
    const query = nameLower.replace(/\s+games?$/, "");
    return { isBulk: true, cleanQuery: query.trim() };
  }
  
  return { isBulk: false, cleanQuery: targetName };
}

export class EntityResolutionLayer {
  /**
   * Resolves entity targets in resolved capabilities.
   */
  async resolve(
    requestId: string,
    userId: string,
    resolvedCapabilities: ResolvedCapability[],
  ): Promise<ResolvedIntentPlan> {
    const trace = aiTraceLogger.current();
    const startTime = Date.now();

    const resolvedIntents: ResolvedIntent[] = [];
    const allResolvedTargets: ResolvedTarget[] = [];
    const clarificationRequests: ClarificationRequest[] = [];

    for (const resCap of resolvedCapabilities) {
      const intent = resCap.intent;
      const resolvedTargets: ResolvedTarget[] = [];

      for (const target of intent.targets) {
        if (target.type === IntentTargetType.Game) {
          const { isBulk, cleanQuery } = getBulkQueryInfo(target.name);
          const resolutionResult = await domainPack().resolveEntity(userId, cleanQuery, { isBulk });

          const resolvedTarget: ResolvedTarget = {
            originalTarget: target,
            resolution: resolutionResult,
          };
          if (isBulk) {
            (resolvedTarget as any).isBulk = true;
          }

          resolvedTargets.push(resolvedTarget);
          allResolvedTargets.push(resolvedTarget);

          if (isBulk && resolutionResult.status === EntityResolutionStatus.RESOLVED) {
            // Every candidate (including index 0, the same entity as the primary
            // resolvedTarget above) needs its own entry keyed by its actual title:
            // PlanningEngine's bulk expansion renames each execution candidate's
            // target to candidate.title and looks it up here by that exact name.
            // Skipping index 0 (an earlier "fix" for a cosmetic duplicate-reference
            // concern) silently broke gameId resolution for the first bulk item,
            // since the primary entry above is only keyed by the generic bulk
            // phrase (e.g. "all Batman games"), never by matched[0]'s own title.
            for (const cand of resolutionResult.candidates || []) {
              const candTarget: IntentTarget = {
                type: IntentTargetType.Game,
                name: cand.title,
              };
              allResolvedTargets.push({
                originalTarget: candTarget,
                resolution: {
                  status: EntityResolutionStatus.RESOLVED,
                  confidence: 1.0,
                  entity: cand,
                  reasoning: "Bulk match candidate resolution.",
                },
              });
            }
          }

          if (!isBulk && resolutionResult.status === EntityResolutionStatus.AMBIGUOUS) {
            const candidates = (resolutionResult.candidates || []).map((c) => ({
              id: c._id.toString(),
              label: c.title,
              confidence: resolutionResult.confidence,
            }));

            clarificationRequests.push({
              requestId,
              type: ClarificationType.AMBIGUOUS_GAME,
              reason: `Multiple matches found for "${target.name}"`,
              entityType: IntentTargetType.Game,
              originalQuery: target.name,
              candidates,
            });

            if (trace) {
              trace.log("EntityResolutionLayer", "Clarification Requested", {
                requestId,
                originalQuery: target.name,
                candidateCount: candidates.length,
              });
            }
          }
        } else {
          // Non-game targets are bypassed
          const resolutionResult = {
            status: EntityResolutionStatus.RESOLVED,
            confidence: 1.0,
            entity: target,
            reasoning: "Non-game target bypass resolution.",
          };

          const resolvedTarget: ResolvedTarget<IntentTarget> = {
            originalTarget: target,
            resolution: resolutionResult,
          };

          resolvedTargets.push(resolvedTarget);
          allResolvedTargets.push(resolvedTarget);
        }
      }

      resolvedIntents.push({
        type: intent.type,
        confidence: intent.confidence,
        originalTargets: intent.targets,
        resolvedTargets,
        parameters: intent.parameters,
      });
    }

    const resolvedIntentPlan: ResolvedIntentPlan = {
      requestId,
      intents: resolvedIntents,
      resolvedTargets: allResolvedTargets,
      clarificationRequests,
    };

    if (trace) {
      const elapsed = Date.now() - startTime;
      trace.log("EntityResolutionLayer", "Entity Resolution Completed", {
        requestId,
        resolvedTargetsCount: allResolvedTargets.length,
        clarificationRequestsCount: clarificationRequests.length,
      }, elapsed);
    }

    return resolvedIntentPlan;
  }
}

export default new EntityResolutionLayer();
