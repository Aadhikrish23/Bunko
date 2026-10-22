import { ContextRequest } from "./ContextRequest";
import { ContextSnapshot } from "./ContextSnapshot";
import { ContextFact } from "./ContextFact";
import { ContextCategory } from "./ContextCategory";
import { ContextProviderRegistry } from "./ContextProviderRegistry";
import aiTraceLogger from "../debug/AITraceLogger";

export class ContextBuilder {
  constructor(
    private readonly registry: ContextProviderRegistry,
  ) {}

  async build(
    request: ContextRequest,
  ): Promise<ContextSnapshot> {
    const trace = aiTraceLogger.current();
    const startTime = Date.now();

    try {
      const facts: Partial<
        Record<ContextCategory, ContextFact[]>
      > = {};

      for (const category of request.requiredCategories) {
        const provider = this.registry.get(category);

        if (!provider) {
          facts[category] = [];
          continue;
        }

        try {
          const result = await provider.build(request);
          facts[category] = result.facts || [];
        } catch {
          facts[category] = [];
        }
      }

      const contextSnapshot = {
        requestId: request.requestId,
        timestamp: new Date(),
        facts,
      };

      if (trace) {
        const elapsed = Date.now() - startTime;
        
        // Build summary logs
        const summary: Record<string, number> = {};
        for (const cat of Object.keys(facts) as ContextCategory[]) {
          summary[`${cat} Facts`] = facts[cat]?.length || 0;
        }

        trace.log("ContextBuilder", "ContextSnapshot Summary", {
          categoriesSummarized: summary,
          ...(process.env.DEBUG_AI === "true" ? { fullContextSnapshot: contextSnapshot } : {}),
        }, elapsed);
      }

      return contextSnapshot;
    } catch (error) {
      if (trace) {
        trace.error("ContextBuilder", error);
      }
      throw error;
    }
  }
}