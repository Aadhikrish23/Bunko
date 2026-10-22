import { MemoryContext } from "./MemoryContext";
import memoryStore from "./MemoryStore";
import { MemoryType } from "./MemoryType";

export class MemoryLoader {
  /**
   * Loads the memory context for a user from the MemoryStore.
   */
  async load(userId: string): Promise<MemoryContext> {
    const aliasEntries = await memoryStore.findByType(userId, MemoryType.ENTITY_ALIAS);
    const prefEntries = await memoryStore.findByType(userId, MemoryType.USER_PREFERENCE);
    const convEntries = await memoryStore.findByType(userId, MemoryType.CONVERSATION);

    const aliases: Record<string, string> = {};
    for (const entry of aliasEntries) {
      if (entry.confidence >= 0.3) {
        aliases[entry.key] = entry.value;
      }
    }

    const preferences: Record<string, string> = {};
    for (const entry of prefEntries) {
      preferences[entry.key] = entry.value;
    }

    const recentLearnedEntities = aliasEntries
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, 5)
      .map((e) => e.value);

    const conversationSummary = convEntries
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map((e) => e.value)
      .join("\n");

    return {
      aliases,
      preferences,
      recentLearnedEntities,
      conversationSummary: conversationSummary || undefined,
      recentSelections: recentLearnedEntities,
    };
  }
}

export default new MemoryLoader();
