/**
 * What the model sees of the user's collection of things (games, books...), so it can name them
 * exactly. The domain pack loads it; the core only passes it along.
 */
export interface LibrarySnapshot {
  /** Newest first: title and status. */
  books: { title: string; status: string }[];
  totalBooks: number;
  collections: string[];
}
