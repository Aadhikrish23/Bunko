import { ResolvedIntentPlan } from "../entity/ResolvedIntentPlan";
import memoryRuntime from "../memory/MemoryRuntime";

export class ConversationLifecycleService {
  /**
   * Publishes execution success events.
   */
  async publishExecutionSuccess(userId: string, resolvedIntentPlan: ResolvedIntentPlan): Promise<void> {
    await memoryRuntime.handleExecutionSuccess(userId, resolvedIntentPlan);
  }

  /**
   * Publishes clarification success events.
   */
  async publishClarificationSuccess(userId: string, query: string, selectedLabel: string): Promise<void> {
    await memoryRuntime.handleClarificationSuccess(userId, query, selectedLabel);
  }

  /**
   * Publishes reference creation/update events.
   */
  async publishNewReferences(userId: string, references: unknown): Promise<void> {
    // Forward or process references when updated
  }
}

export default new ConversationLifecycleService();
