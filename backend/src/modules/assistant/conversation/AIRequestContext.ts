import { AIToolContext } from "../sdk/AIToolContext";
import { ConversationContext } from "./ConversationContext";
import { MemoryContext } from "../memory/MemoryContext";
import type { LibrarySnapshot } from "../context/LibrarySnapshot";
import type { Exchange } from "./RecentExchanges";

export interface AIRequestContext {
  toolContext: AIToolContext;
  conversationContext: ConversationContext;
  memoryContext?: MemoryContext;
  /** The user's games and collections, for the model to name things exactly. */
  library?: LibrarySnapshot;
  /** The last few exchanges, including failures and questions. */
  recentExchanges?: Exchange[];
  /** The game or collection page the user has open. */
  page?: { gameTitle?: string; collectionName?: string };
  /** Facts from the game database about the games a question names (answer mode only). */
  facts?: string;
}


