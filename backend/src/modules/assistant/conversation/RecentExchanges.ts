/**
 * The last few things the user said and what the assistant answered, for the
 * model's prompt. Includes failures and clarifying questions (the session's
 * own turn log only records successful executions), so a follow-up like
 * "no, I meant celeste" has the context it refers to.
 */
export interface Exchange {
  user: string;
  assistant: string;
}

const MAX = 6;

class RecentExchanges {
  private readonly byUser = new Map<string, Exchange[]>();

  add(userId: string, user: string, assistant: string) {
    const list = this.byUser.get(userId) ?? [];
    list.push({ user, assistant: assistant.slice(0, 800) });
    this.byUser.set(userId, list.slice(-MAX));
  }

  get(userId: string): Exchange[] {
    return this.byUser.get(userId) ?? [];
  }

  clear(userId: string) {
    this.byUser.delete(userId);
  }
}

export default new RecentExchanges();
