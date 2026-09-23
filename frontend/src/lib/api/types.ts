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

export interface ReaderManifest {
  fileUrl: string;
  format: 'EPUB' | 'PDF';
  startPosition: string | null;
  confidence: number | null;
  sessionId: string;
}

export interface ResolvedPosition {
  structuralId: string | null;
  chapterLabel: string | null;
  confidence: number;
  requiresConfirmation: boolean;
}

export interface BasicStatistics {
  booksCompleted: number;
  totalMinutesRead: number;
  currentStreakDays: number;
}

export interface DigitalFile {
  id: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
}
