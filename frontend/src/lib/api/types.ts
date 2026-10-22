// Mirrors backend DTOs (openapi.yaml is the binding contract — see
// CODING_STANDARDS.md §3: if these diverge, one of the two is wrong).

export type ReadingStatus = 'WANT_TO_READ' | 'READING' | 'FINISHED' | 'DID_NOT_FINISH';
export type EditionFormat = 'PHYSICAL' | 'EPUB' | 'PDF';
export type SessionStatus = 'ACTIVE' | 'PAUSED' | 'ENDED';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

export interface AuthResponseData {
  accessToken: string;
  user: AuthUser;
}

export interface Profile {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface EditionSummary {
  id: string;
  format: EditionFormat;
  publisher: string | null;
  copyId: string | null;
}

export interface SeriesSibling {
  workId: string;
  title: string;
  coverImageUrl: string | null;
  inLibrary: boolean;
}

export interface Work {
  id: string;
  title: string;
  authors: string[];
  status: ReadingStatus;
  editions: EditionSummary[];
  journeyId: string | null;
  genres: string[];
  seriesName: string | null;
  shelfIds: string[];
  coverImageUrl: string | null;
  description: string | null;
  originalLanguage?: string | null;
  language?: string | null;
  partsCount?: number | null;
  chaptersCount?: number | null;
  // Only populated on a single-work GET, empty on library-list rows.
  seriesWorks: SeriesSibling[];
}

export interface MetadataCandidate {
  externalSource: string;
  externalId: string;
  title: string;
  authors: string[];
  coverImageUrl: string | null;
  firstPublishYear: number | null;
  description?: string | null;
  seriesName?: string | null;
  originalLanguage?: string | null;
  language?: string | null;
  partsCount?: number | null;
  chaptersCount?: number | null;
}

export interface Shelf {
  id: string;
  name: string;
}

export interface Copy {
  id: string;
  editionId: string;
  digitalFileId: string | null;
}

export interface ReadingSession {
  id: string;
  status: SessionStatus;
  startTime: string;
  endTime: string | null;
  durationSeconds: number | null;
  startPosition: string | null;
  endPosition: string | null;
  reflection: string | null;
}

export interface JournalEntry extends ReadingSession {
  annotations: Annotation[];
  notes: Note[];
}

export interface ReaderManifest {
  fileUrl: string;
  format: 'EPUB' | 'PDF';
  startPosition: string | null;
  confidence: number | null;
  sessionId: string;
  workId: string;
  copyId: string;
}

export interface Chapter {
  structuralId: string;
  label: string;
  order: number;
  pageNumber: number | null;
  text: string;
}

export interface ChaptersResponse {
  format: 'EPUB' | 'PDF';
  hasTextLayer: boolean;
  chapters: Chapter[];
}

export interface ResolvedPosition {
  structuralId: string | null;
  chapterLabel: string | null;
  confidence: number;
  requiresConfirmation: boolean;
}

// `label` null = the book has no value for that dimension (no genre, no
// author, unknown language). byFormat labels are EditionFormat codes.
export interface BreakdownEntry {
  label: string | null;
  count: number;
}

export interface ReadingPace {
  pagesPerHour: number | null;
  pagesPerSession: number | null;
  sampleSessions: number;
}

export interface Statistics {
  booksCompleted: number;
  totalMinutesRead: number;
  totalSessions: number;
  averageSessionMinutes: number | null;
  pagesRead: number;
  currentStreakDays: number;
  longestStreakDays: number;
  pace: ReadingPace;
  breakdowns: {
    byGenre: BreakdownEntry[];
    byAuthor: BreakdownEntry[];
    byLanguage: BreakdownEntry[];
    byFormat: BreakdownEntry[];
  };
}

export type TrendRange = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'all-time';

export interface TrendBucket {
  start: string; // YYYY-MM-DD, first local day of the bucket
  minutesRead: number;
  sessions: number;
  pagesRead: number;
}

export interface Trends {
  range: TrendRange;
  timeZone: string;
  buckets: TrendBucket[];
  totals: Omit<TrendBucket, 'start'>;
}

export interface DigitalFile {
  id: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
}

export type AnnotationKind = 'HIGHLIGHT' | 'QUOTE';

export interface Annotation {
  id: string;
  copyId: string;
  sessionId: string | null;
  kind: AnnotationKind;
  position: string;
  text: string;
  color: string | null;
  note: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export type NoteScope = 'BOOK' | 'CHAPTER' | 'SECTION' | 'PAGE' | 'PASSAGE' | 'SESSION';

export interface Note {
  id: string;
  workId: string;
  copyId: string | null;
  sessionId: string | null;
  scope: NoteScope;
  position: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface Review {
  id: string;
  workId: string;
  rating: number | null;
  body: string | null;
  isFavourite: boolean;
  rereadIntention: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface SearchResult {
  type: 'ANNOTATION' | 'NOTE';
  id: string;
  workId: string;
  editionId: string | null;
  excerpt: string;
  createdAt: string;
}
