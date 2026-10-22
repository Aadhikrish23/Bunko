import { ConversationSession } from "./ConversationSession";
import { ConversationStatus } from "./ConversationStatus";

export class ConversationStore {
  private readonly store = new Map<string, ConversationSession>();

  async get(userId: string): Promise<ConversationSession | null> {
    return this.store.get(userId) || null;
  }

  async save(session: ConversationSession): Promise<void> {
    this.store.set(session.userId, session);
  }

  async create(userId: string, initialSession: ConversationSession): Promise<ConversationSession> {
    this.store.set(userId, initialSession);
    return initialSession;
  }

  async close(userId: string): Promise<void> {
    const session = this.store.get(userId);
    if (session) {
      session.status = ConversationStatus.CLOSED;
      session.updatedAt = new Date();
      this.store.set(userId, session);
    }
  }

  async delete(userId: string): Promise<void> {
    this.store.delete(userId);
  }

  async update(userId: string, sessionUpdate: Partial<ConversationSession>): Promise<void> {
    const existing = this.store.get(userId);
    if (existing) {
      Object.assign(existing, sessionUpdate);
      existing.updatedAt = new Date();
      this.store.set(userId, existing);
    }
  }
}

export default new ConversationStore();
