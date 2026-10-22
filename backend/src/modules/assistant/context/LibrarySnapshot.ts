/**
 * What the model sees of the user's collection of things (games, books...), so it can name them
 * exactly. The domain pack loads it; the core only passes it along.
 */
export interface LibrarySnapshot {
  /** Newest first: title and status. */
  games: { title: string; status: string }[];
  totalGames: number;
  collections: string[];
}
