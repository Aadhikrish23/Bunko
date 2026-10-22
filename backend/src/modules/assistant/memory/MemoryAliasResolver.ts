import memoryStore from "./MemoryStore";
import { ConversationSession } from "../conversation/ConversationSession";
import { OptionEntity } from "../clarification/ClarificationOptionBuilder";
import { distance } from "fastest-levenshtein";

export class MemoryAliasResolver {
  /**
   * Resolves target names into candidate entities using alias resolution precedence.
   */
  async resolve(
    userId: string,
    query: string,
    candidates: OptionEntity[],
    session?: ConversationSession
  ): Promise<OptionEntity | null> {
    const normQuery = query.toLowerCase().trim();
    if (!normQuery || !candidates || candidates.length === 0) return null;

    // 1. Conversation References (Highest Priority)
    if (session && session.references) {
      const refs = session.references;
      const slotValues = [
        refs.currentGame,
        refs.lastEntity,
        refs.pendingEntity,
        refs.currentCollection,
        refs.currentProvider,
      ].filter(Boolean);

      for (const slot of slotValues) {
        if (slot) {
          const slotName = slot.displayName.toLowerCase().trim();
          if (slotName === normQuery || slot.entityId === query) {
            const match = candidates.find(
              (c) =>
                c.id === slot.entityId ||
                c._id?.toString() === slot.entityId ||
                c.title?.toLowerCase() === slotName ||
                c.name?.toLowerCase() === slotName
            );
            if (match) return match;
          }
        }
      }
    }

    // 2. Learned Memory Aliases (only trust aliases at/above the same confidence
    // floor MemoryLoader applies elsewhere, so a weakened/low-confidence alias
    // doesn't get auto-applied instead of falling through to fuzzy matching).
    const aliasEntry = await memoryStore.findAlias(userId, normQuery);
    if (aliasEntry && aliasEntry.value && aliasEntry.confidence >= 0.3) {
      const canonicalName = aliasEntry.value.toLowerCase().trim();
      const match = candidates.find(
        (c) =>
          c.id === aliasEntry.value ||
          c._id?.toString() === aliasEntry.value ||
          c.title?.toLowerCase() === canonicalName ||
          c.name?.toLowerCase() === canonicalName
      );
      if (match) return match;
    }

    // 3. Static Aliases (Exact Name Match)
    const exactMatch = candidates.find(
      (c) =>
        (c.title && c.title.toLowerCase() === normQuery) ||
        (c.name && c.name.toLowerCase() === normQuery)
    );
    if (exactMatch) return exactMatch;

    return null;
  }
}

export default new MemoryAliasResolver();
