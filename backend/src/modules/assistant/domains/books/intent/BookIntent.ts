/** Every intent the planner may return for books (SRS §20.6). AskQuestion and Help are the core's. */
export enum BookIntent {
  AddBook = 'AddBook',
  RemoveBook = 'RemoveBook',
  /** Any reading-status change; StartBook/FinishBook/DnfBook are normalised into it. */
  SetStatus = 'SetStatus',
  StartBook = 'StartBook',
  FinishBook = 'FinishBook',
  DnfBook = 'DnfBook',
  RateBook = 'RateBook',
  ReviewBook = 'ReviewBook',
  DeleteReview = 'DeleteReview',
  AddNote = 'AddNote',
  SearchLibrary = 'SearchLibrary',
  LibraryQuestion = 'LibraryQuestion',
  RecommendBook = 'RecommendBook',
  CreateShelf = 'CreateShelf',
  OrganizeShelf = 'OrganizeShelf',
  AskQuestion = 'AskQuestion',
  Help = 'Help',
}

/** Intents that only read; a question never turns into anything else. */
export const READ_ONLY = new Set<string>([
  BookIntent.SearchLibrary,
  BookIntent.LibraryQuestion,
  BookIntent.RecommendBook,
  BookIntent.AskQuestion,
  BookIntent.Help,
]);

/** Intents that act on one book at a time; several books become several intents. */
export const PER_BOOK = new Set<string>([
  BookIntent.AddBook,
  BookIntent.RemoveBook,
  BookIntent.SetStatus,
  BookIntent.RateBook,
  BookIntent.ReviewBook,
  BookIntent.DeleteReview,
  BookIntent.AddNote,
  BookIntent.OrganizeShelf,
]);
