import { logger } from '../../lib/logger';

export interface MetadataCandidate {
  externalSource: string;
  externalId: string;
  title: string;
  authors: string[];
  coverImageUrl: string | null;
  firstPublishYear: number | null;
}

interface OpenLibraryDoc {
  key: string;
  title: string;
  author_name?: string[];
  cover_i?: number;
  first_publish_year?: number;
}

interface OpenLibrarySearchResponse {
  docs: OpenLibraryDoc[];
}

const OPEN_LIBRARY_SEARCH_URL = 'https://openlibrary.org/search.json';
const MAX_RESULTS = 10;
const REQUEST_TIMEOUT_MS = 5000;

function toCandidate(doc: OpenLibraryDoc): MetadataCandidate {
  return {
    externalSource: 'open-library',
    externalId: doc.key.replace('/works/', ''),
    title: doc.title,
    authors: doc.author_name ?? [],
    coverImageUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null,
    firstPublishYear: doc.first_publish_year ?? null,
  };
}

// Called once per explicit user search (ARCHITECTURE.md §11) — never on
// every page load. On any upstream failure (network, rate limit,
// malformed response), degrades to an empty result list rather than a
// 500 (T-013a) — Open Library being briefly unavailable shouldn't block
// the "add a book" flow; the user can still enter details manually.
export async function searchBookMetadata(query: string): Promise<MetadataCandidate[]> {
  const url = `${OPEN_LIBRARY_SEARCH_URL}?q=${encodeURIComponent(query)}&limit=${MAX_RESULTS}`;

  let response: globalThis.Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (err) {
    logger.warn({ err }, 'Open Library request failed');
    return [];
  }

  if (!response.ok) {
    logger.warn({ status: response.status }, 'Open Library returned a non-2xx response');
    return [];
  }

  try {
    const body = (await response.json()) as OpenLibrarySearchResponse;
    return body.docs.slice(0, MAX_RESULTS).map(toCandidate);
  } catch (err) {
    logger.warn({ err }, 'Open Library response was not valid JSON');
    return [];
  }
}
