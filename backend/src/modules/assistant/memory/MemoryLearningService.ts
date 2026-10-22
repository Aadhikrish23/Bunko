import memoryStore from "./MemoryStore";
import { MemoryType } from "./MemoryType";
import { MemorySource } from "./MemorySource";
import MemoryConfidencePolicy from "./MemoryConfidencePolicy";

export class MemoryLearningService {
  /**
   * Learns an entity alias from a clarification choice.
   */
  async learnAlias(userId: string, query: string, selectedLabel: string): Promise<{ event: string; details: any }> {
    const normQuery = query.toLowerCase().trim();
    if (!normQuery) return { event: "NoOp", details: {} };

    let entry = await memoryStore.findAlias(userId, normQuery);
    let eventName = "Alias Learned";
    let details: any = { userId, key: normQuery };

    if (entry) {
      if (entry.value === selectedLabel) {
        const oldConfidence = entry.confidence;
        entry.confidence = MemoryConfidencePolicy.strengthen(entry.confidence);
        entry.usageCount += 1;
        entry.lastUsedAt = new Date();
        entry.updatedAt = new Date();
        await memoryStore.saveAlias(userId, entry);

        eventName = "Memory Confidence Updated";
        details = {
          userId,
          key: normQuery,
          type: MemoryType.ENTITY_ALIAS,
          oldConfidence,
          newConfidence: entry.confidence,
          action: "STRENGTHENED",
        };
      } else {
        const oldConfidence = entry.confidence;
        entry.confidence = MemoryConfidencePolicy.weaken(entry.confidence);
        entry.updatedAt = new Date();

        if (MemoryConfidencePolicy.shouldOverride(entry.confidence)) {
          const oldVal = entry.value;
          entry.value = selectedLabel;
          entry.confidence = MemoryConfidencePolicy.INITIAL_CONFIDENCE;
          entry.usageCount = 1;
          entry.lastUsedAt = new Date();
          entry.source = MemorySource.USER_SELECTION;
          await memoryStore.saveAlias(userId, entry);

          eventName = "Alias Learned";
          details = {
            userId,
            key: normQuery,
            oldValue: oldVal,
            newValue: selectedLabel,
            action: "OVERRIDDEN",
          };
        } else {
          await memoryStore.saveAlias(userId, entry);

          eventName = "Memory Confidence Updated";
          details = {
            userId,
            key: normQuery,
            type: MemoryType.ENTITY_ALIAS,
            oldConfidence,
            newConfidence: entry.confidence,
            action: "WEAKENED",
          };
        }
      }
    } else {
      entry = {
        id: `${userId}:${MemoryType.ENTITY_ALIAS}:${normQuery}`,
        userId,
        type: MemoryType.ENTITY_ALIAS,
        key: normQuery,
        value: selectedLabel,
        confidence: MemoryConfidencePolicy.INITIAL_CONFIDENCE,
        source: MemorySource.USER_SELECTION,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastUsedAt: new Date(),
        usageCount: 1,
        metadata: {},
      };
      await memoryStore.saveAlias(userId, entry);

      eventName = "Alias Learned";
      details = {
        userId,
        key: normQuery,
        value: selectedLabel,
        action: "CREATED",
      };
    }

    return { event: eventName, details };
  }
}

export default new MemoryLearningService();
