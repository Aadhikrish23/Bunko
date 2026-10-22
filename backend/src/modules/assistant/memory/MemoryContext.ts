export interface MemoryContext {
  aliases: Record<string, string>;
  preferences: Record<string, string>;
  recentSelections: string[];
  recentLearnedEntities: string[];
  conversationSummary?: string;
}
