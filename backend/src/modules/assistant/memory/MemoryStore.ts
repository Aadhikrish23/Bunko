import { MemoryEntry } from "./MemoryEntry";
import { MemoryType } from "./MemoryType";

export class MemoryStore {
  // Underlying in-memory store: Map<userId, Map<id, MemoryEntry>>
  private readonly store = new Map<string, Map<string, MemoryEntry>>();

  private getUserStore(userId: string): Map<string, MemoryEntry> {
    let userStore = this.store.get(userId);
    if (!userStore) {
      userStore = new Map<string, MemoryEntry>();
      this.store.set(userId, userStore);
    }
    return userStore;
  }

  /**
   * Finds a specific learned entity alias.
   */
  async findAlias(userId: string, key: string): Promise<MemoryEntry | null> {
    const userStore = this.getUserStore(userId);
    const id = `${userId}:${MemoryType.ENTITY_ALIAS}:${key.toLowerCase().trim()}`;
    return userStore.get(id) || null;
  }

  /**
   * Saves a learned entity alias.
   */
  async saveAlias(userId: string, entry: MemoryEntry): Promise<void> {
    const userStore = this.getUserStore(userId);
    userStore.set(entry.id, entry);
  }

  /**
   * Finds a user preference memory.
   */
  async findPreference(userId: string, key: string): Promise<MemoryEntry | null> {
    const userStore = this.getUserStore(userId);
    const id = `${userId}:${MemoryType.USER_PREFERENCE}:${key.toLowerCase().trim()}`;
    return userStore.get(id) || null;
  }

  /**
   * Saves a user preference memory.
   */
  async savePreference(userId: string, entry: MemoryEntry): Promise<void> {
    const userStore = this.getUserStore(userId);
    userStore.set(entry.id, entry);
  }

  /**
   * Increments usage counters for a memory.
   */
  async incrementUsage(userId: string, type: MemoryType, key: string): Promise<void> {
    const userStore = this.getUserStore(userId);
    const id = `${userId}:${type}:${key.toLowerCase().trim()}`;
    const entry = userStore.get(id);
    if (entry) {
      entry.usageCount += 1;
      entry.lastUsedAt = new Date();
      entry.updatedAt = new Date();
    }
  }

  /**
   * Generic low-level read.
   */
  async get(userId: string, type: MemoryType, key: string): Promise<MemoryEntry | null> {
    const userStore = this.getUserStore(userId);
    const id = `${userId}:${type}:${key.toLowerCase().trim()}`;
    return userStore.get(id) || null;
  }

  /**
   * Generic low-level write.
   */
  async save(entry: MemoryEntry): Promise<void> {
    const userStore = this.getUserStore(entry.userId);
    userStore.set(entry.id, entry);
  }

  /**
   * Generic low-level delete.
   */
  async delete(userId: string, type: MemoryType, key: string): Promise<boolean> {
    const userStore = this.getUserStore(userId);
    const id = `${userId}:${type}:${key.toLowerCase().trim()}`;
    return userStore.delete(id);
  }

  /**
   * Finds all memories by type.
   */
  async findByType(userId: string, type: MemoryType): Promise<MemoryEntry[]> {
    const userStore = this.getUserStore(userId);
    return Array.from(userStore.values()).filter((e) => e.type === type);
  }
}

export default new MemoryStore();
