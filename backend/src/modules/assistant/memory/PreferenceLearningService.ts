import memoryStore from "./MemoryStore";
import { MemoryType } from "./MemoryType";
import { MemorySource } from "./MemorySource";
import { MemoryKey } from "./MemoryKey";
import MemoryConfidencePolicy from "./MemoryConfidencePolicy";
import { ResolvedIntentPlan } from "../entity/ResolvedIntentPlan";

export class PreferenceLearningService {
  /**
   * Evaluates executed plan to learn/infer preferences.
   */
  async learnFromExecution(userId: string, resolvedIntentPlan: ResolvedIntentPlan): Promise<Array<{ event: string; details: any }>> {
    if (!resolvedIntentPlan || !resolvedIntentPlan.intents) return [];

    const logs: Array<{ event: string; details: any }> = [];

    for (const intent of resolvedIntentPlan.intents) {
      const providerParam = intent.parameters?.find((p) => p.type === "Provider" || p.type === "Platform");
      if (providerParam && providerParam.value) {
        const res = await this.trackBehavior(userId, MemoryKey.FAVORITE_PROVIDER, String(providerParam.value));
        if (res) logs.push(res);
      }

      const statusParam = intent.parameters?.find((p) => p.type === "Status");
      if (statusParam && statusParam.value) {
        const res = await this.trackBehavior(userId, MemoryKey.FAVORITE_STATUS, String(statusParam.value));
        if (res) logs.push(res);
      }

      const collectionTarget = intent.resolvedTargets?.find((t) => t.originalTarget.type === "Collection");
      if (collectionTarget) {
        const res = await this.trackBehavior(userId, MemoryKey.FAVORITE_COLLECTION, collectionTarget.originalTarget.name);
        if (res) logs.push(res);
      }
    }

    return logs;
  }

  private async trackBehavior(userId: string, preferenceKey: string, value: string): Promise<{ event: string; details: any } | null> {
    const trackingKey = `track:${preferenceKey}:${value}`;
    let entry = await memoryStore.get(userId, MemoryType.LEARNING, trackingKey);

    if (entry) {
      entry.usageCount += 1;
      entry.lastUsedAt = new Date();
      entry.updatedAt = new Date();
      await memoryStore.save(entry);
    } else {
      entry = {
        id: `${userId}:${MemoryType.LEARNING}:${trackingKey}`,
        userId,
        type: MemoryType.LEARNING,
        key: trackingKey,
        value,
        confidence: 0.1,
        source: MemorySource.SYSTEM,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastUsedAt: new Date(),
        usageCount: 1,
        metadata: { preferenceKey },
      };
      await memoryStore.save(entry);
    }

    if (entry.usageCount >= 3) {
      let prefEntry = await memoryStore.findPreference(userId, preferenceKey);
      if (!prefEntry || prefEntry.value !== value) {
        const oldVal = prefEntry?.value;
        prefEntry = {
          id: `${userId}:${MemoryType.USER_PREFERENCE}:${preferenceKey}`,
          userId,
          type: MemoryType.USER_PREFERENCE,
          key: preferenceKey,
          value,
          confidence: 0.9,
          source: MemorySource.SYSTEM,
          createdAt: prefEntry?.createdAt || new Date(),
          updatedAt: new Date(),
          lastUsedAt: new Date(),
          usageCount: (prefEntry?.usageCount || 0) + 1,
          metadata: { inferredFromCount: entry.usageCount },
        };
        await memoryStore.savePreference(userId, prefEntry);

        return {
          event: "Preference Learned",
          details: {
            userId,
            key: preferenceKey,
            oldValue: oldVal,
            newValue: value,
            confidence: prefEntry.confidence,
          },
        };
      } else {
        const oldConfidence = prefEntry.confidence;
        prefEntry.confidence = MemoryConfidencePolicy.strengthenRepeated(prefEntry.confidence);
        prefEntry.usageCount += 1;
        prefEntry.lastUsedAt = new Date();
        prefEntry.updatedAt = new Date();
        await memoryStore.savePreference(userId, prefEntry);

        return {
          event: "Memory Confidence Updated",
          details: {
            userId,
            key: preferenceKey,
            type: MemoryType.USER_PREFERENCE,
            oldConfidence,
            newConfidence: prefEntry.confidence,
            action: "STRENGTHENED",
          },
        };
      }
    }

    return null;
  }
}

export default new PreferenceLearningService();
