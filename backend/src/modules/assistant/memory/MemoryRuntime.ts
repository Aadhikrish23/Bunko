import { MemoryContext } from "./MemoryContext";
import memoryLoader from "./MemoryLoader";
import memoryLearningService from "./MemoryLearningService";
import preferenceLearningService from "./PreferenceLearningService";
import { ResolvedIntentPlan } from "../entity/ResolvedIntentPlan";
import aiTraceLogger from "../debug/AITraceLogger";

export class MemoryRuntime {
  /**
   * Loads the memory context for planning.
   */
  async loadMemoryContext(userId: string): Promise<MemoryContext> {
    const context = await memoryLoader.load(userId);

    const trace = aiTraceLogger.current();
    if (trace) {
      trace.log("MemoryRuntime", "Memory Loaded", {
        userId,
        aliasCount: Object.keys(context.aliases).length,
        preferenceCount: Object.keys(context.preferences).length,
      });
      trace.log("MemoryRuntime", "Memory Used", {
        userId,
        context,
      });
    }

    return context;
  }

  /**
   * Learns aliases from successful entity clarification events.
   */
  async handleClarificationSuccess(userId: string, query: string, selectedLabel: string): Promise<void> {
    const result = await memoryLearningService.learnAlias(userId, query, selectedLabel);

    const trace = aiTraceLogger.current();
    if (trace && result.event !== "NoOp") {
      trace.log("MemoryRuntime", result.event, result.details);
    }
  }

  /**
   * Infers preferences from successful intent executions.
   */
  async handleExecutionSuccess(userId: string, resolvedIntentPlan: ResolvedIntentPlan): Promise<void> {
    const logs = await preferenceLearningService.learnFromExecution(userId, resolvedIntentPlan);

    const trace = aiTraceLogger.current();
    if (trace) {
      for (const log of logs) {
        trace.log("MemoryRuntime", log.event, log.details);
      }
    }
  }
}

export default new MemoryRuntime();
