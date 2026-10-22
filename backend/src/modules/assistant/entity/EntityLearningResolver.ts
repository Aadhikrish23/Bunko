import memoryStore from "../memory/MemoryStore";
import { MemoryType } from "../memory/MemoryType";
import { MemorySource } from "../memory/MemorySource";
import MemoryConfidencePolicy from "../memory/MemoryConfidencePolicy";

export class EntityLearningResolver {
  /**
   * Resolves a learned alias for a specific user and query.
   */
  async resolve(userId: string, query: string): Promise<string | null> {
    const entry = await memoryStore.findAlias(userId, query);
    return entry ? entry.value : null;
  }

  /**
   * Records a user's selection to learn/strengthen an alias mapping.
   */
  async recordSelection(userId: string, query: string, canonicalEntityName: string): Promise<void> {
    const normQuery = query.toLowerCase().trim();
    let entry = await memoryStore.findAlias(userId, normQuery);

    if (entry) {
      if (entry.value === canonicalEntityName) {
        entry.confidence = MemoryConfidencePolicy.strengthen(entry.confidence);
        entry.usageCount += 1;
        entry.lastUsedAt = new Date();
        entry.updatedAt = new Date();
        await memoryStore.saveAlias(userId, entry);
      } else {
        entry.confidence = MemoryConfidencePolicy.weaken(entry.confidence);
        entry.updatedAt = new Date();

        if (MemoryConfidencePolicy.shouldOverride(entry.confidence)) {
          entry.value = canonicalEntityName;
          entry.confidence = MemoryConfidencePolicy.INITIAL_CONFIDENCE;
          entry.usageCount = 1;
          entry.lastUsedAt = new Date();
          entry.source = MemorySource.USER_SELECTION;
          await memoryStore.saveAlias(userId, entry);
        } else {
          await memoryStore.saveAlias(userId, entry);
        }
      }
    } else {
      entry = {
        id: `${userId}:${MemoryType.ENTITY_ALIAS}:${normQuery}`,
        userId,
        type: MemoryType.ENTITY_ALIAS,
        key: normQuery,
        value: canonicalEntityName,
        confidence: MemoryConfidencePolicy.INITIAL_CONFIDENCE,
        source: MemorySource.USER_SELECTION,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastUsedAt: new Date(),
        usageCount: 1,
        metadata: {},
      };
      await memoryStore.saveAlias(userId, entry);
    }
  }

  /**
   * Clears learned aliases for a specific user.
   */
  async clear(userId: string): Promise<void> {
    const entries = await memoryStore.findByType(userId, MemoryType.ENTITY_ALIAS);
    for (const entry of entries) {
      await memoryStore.delete(userId, MemoryType.ENTITY_ALIAS, entry.key);
    }
  }
}

export default new EntityLearningResolver();
