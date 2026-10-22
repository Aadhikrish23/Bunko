import { ContextRequest } from "./ContextRequest";
import { ContextCategory } from "./ContextCategory";
import { ResolvedCapability } from "../planning/ResolvedCapability";
import { IntentTarget } from "../intent/IntentTarget";
import aiTraceLogger from "../debug/AITraceLogger";

export class ContextRequestBuilder {
  /**
   * Resolves capability requirements into a unified ContextRequest.
   */
  build(
    requestId: string,
    userId: string,
    resolvedCapabilities: ResolvedCapability[],
  ): ContextRequest {
    const trace = aiTraceLogger.current();
    const startTime = Date.now();

    try {
      const requiredCategoriesSet = new Set<ContextCategory>();
      const targetsSet = new Set<string>();
      const targets: IntentTarget[] = [];

      for (const resolved of resolvedCapabilities) {
        for (const req of resolved.capability.requirements) {
          if (req.contextCategory) {
            requiredCategoriesSet.add(req.contextCategory);
          }
        }

        for (const target of resolved.intent.targets) {
          const key = `${target.type}:${target.name}`;
          if (!targetsSet.has(key)) {
            targetsSet.add(key);
            targets.push(target);
          }
        }
      }

      const contextRequest = {
        requestId,
        userId,
        requiredCategories: Array.from(requiredCategoriesSet),
        targets,
      };

      if (trace) {
        const elapsed = Date.now() - startTime;
        trace.log("ContextRequestBuilder", "ContextRequest", contextRequest, elapsed);

        // Update stats
        trace.updateStats({
          contextCategories: contextRequest.requiredCategories,
        });
      }

      return contextRequest;
    } catch (error) {
      if (trace) {
        trace.error("ContextRequestBuilder", error);
      }
      throw error;
    }
  }
}

export default new ContextRequestBuilder();
