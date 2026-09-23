import { env } from '../../config/env';
import { logger } from '../../lib/logger';

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

export interface RelatedBook {
  title: string;
  authors: string[];
  coverImageUrl: string | null;
  description: string | null;
  externalSource: string;
  externalId: string | null;
}

export interface RelatedDiscoveryResult {
  seriesName: string;
  books: RelatedBook[];
}

const MAX_RESULTS = 20;
const REQUEST_TIMEOUT_MS = 4000;
const SPARQL_TIMEOUT_MS = 8000;
const APP_USER_AGENT = 'Bunko/1.0 (https://github.com/bunko-app/bunko; contact@bunko.local)';

const LANGUAGE_NAME_MAP: Record<string, string> = {
  en: 'English', eng: 'English', english: 'English',
  ja: 'Japanese', jpn: 'Japanese', japanese: 'Japanese',
  ta: 'Tamil', tam: 'Tamil', tamil: 'Tamil',
  hi: 'Hindi', hin: 'Hindi', hindi: 'Hindi',
  es: 'Spanish', spa: 'Spanish', spanish: 'Spanish',
  fr: 'French', fre: 'French', fra: 'French', french: 'French',
  de: 'German', ger: 'German', deu: 'German', german: 'German',
  zh: 'Chinese', zho: 'Chinese', chi: 'Chinese', chinese: 'Chinese',
  ru: 'Russian', rus: 'Russian', russian: 'Russian',
  ar: 'Arabic', ara: 'Arabic', arabic: 'Arabic',
  pt: 'Portuguese', por: 'Portuguese', portuguese: 'Portuguese',
  it: 'Italian', ita: 'Italian', italian: 'Italian',
  ko: 'Korean', kor: 'Korean', korean: 'Korean',
};

export function normalizeLanguageName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().toLowerCase();
  if (LANGUAGE_NAME_MAP[cleaned]) {
    return LANGUAGE_NAME_MAP[cleaned];
  }
  try {
    const displayNames = new Intl.DisplayNames(['en'], { type: 'language' });
    const resolved = displayNames.of(cleaned);
    if (resolved && resolved.toLowerCase() !== cleaned) {
      return resolved;
    }
  } catch {
    // ignore invalid locale code
  }
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function parsePartsAndChapters(desc: string | null | undefined): { partsCount: number | null; chaptersCount: number | null } {
  if (!desc) return { partsCount: null, chaptersCount: null };
  let partsCount: number | null = null;
  let chaptersCount: number | null = null;

  const chapMatch = desc.match(/(\d+)\s*(?:chapters|chapter)/i);
  if (chapMatch && chapMatch[1]) {
    chaptersCount = parseInt(chapMatch[1], 10);
  }

  const partMatch = desc.match(/(\d+)\s*(?:parts|part|volumes|volume|vols|vol)/i);
  if (partMatch && partMatch[1]) {
    partsCount = parseInt(partMatch[1], 10);
  }

  return { partsCount, chaptersCount };
}

function cleanDescription(raw: string): string {
  return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// -----------------------------------------------------------------------------
// Tier 1: Google Books API (Optional — active if GOOGLE_BOOKS_API_KEY is set)
// -----------------------------------------------------------------------------

interface GoogleBooksItem {
  id: string;
  volumeInfo?: {
    title?: string;
    authors?: string[];
    publishedDate?: string;
    description?: string;
    language?: string;
    imageLinks?: {
      thumbnail?: string;
      smallThumbnail?: string;
    };
  };
}

interface GoogleBooksSearchResponse {
  items?: GoogleBooksItem[];
}

function toGoogleCandidate(item: GoogleBooksItem, targetLang?: string): MetadataCandidate {
  const info = item.volumeInfo ?? {};
  const rawCover = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail ?? null;
  const coverImageUrl = rawCover ? rawCover.replace(/^http:\/\//i, 'https://') : null;

  let firstPublishYear: number | null = null;
  if (info.publishedDate) {
    const parsed = parseInt(info.publishedDate.slice(0, 4), 10);
    if (!Number.isNaN(parsed)) firstPublishYear = parsed;
  }

  const description = info.description ? cleanDescription(info.description) : null;
  const { partsCount, chaptersCount } = parsePartsAndChapters(description);

  const detectedLang = normalizeLanguageName(info.language);
  const userLang = targetLang && targetLang !== 'all' ? normalizeLanguageName(targetLang) : null;

  return {
    externalSource: 'google-books',
    externalId: item.id,
    title: info.title ?? 'Untitled',
    authors: info.authors ?? [],
    coverImageUrl,
    firstPublishYear,
    description,
    originalLanguage: detectedLang || 'Japanese',
    language: userLang || detectedLang || 'English',
    partsCount,
    chaptersCount,
  };
}

async function searchGoogleBooks(query: string, apiKey: string, targetLang?: string): Promise<MetadataCandidate[]> {
  let url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=${MAX_RESULTS}&key=${encodeURIComponent(apiKey)}`;
  if (targetLang && targetLang !== 'all') {
    url += `&langRestrict=${encodeURIComponent(targetLang)}`;
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) {
    logger.warn({ status: response.status }, 'Google Books search returned non-2xx response');
    return [];
  }
  const body = (await response.json()) as GoogleBooksSearchResponse;
  if (!body.items || !Array.isArray(body.items)) return [];
  const validItems = body.items.filter((item) => item.volumeInfo?.title && item.volumeInfo.title !== 'undefined');
  return validItems.slice(0, MAX_RESULTS).map((item) => toGoogleCandidate(item, targetLang));
}

async function fetchGoogleBooksDescription(volumeId: string): Promise<string | null> {
  const apiKey = env.GOOGLE_BOOKS_API_KEY;
  const url = `https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(volumeId)}${apiKey ? `?key=${encodeURIComponent(apiKey)}` : ''}`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) return null;
    const body = (await response.json()) as GoogleBooksItem;
    return body.volumeInfo?.description ? cleanDescription(body.volumeInfo.description) : null;
  } catch (err) {
    logger.warn({ err }, 'Google Books volume-detail request failed');
    return null;
  }
}

// -----------------------------------------------------------------------------
// Hardcover API (GraphQL provider — active if HARDCOVER_API_KEY is configured)
// -----------------------------------------------------------------------------

interface HardcoverBook {
  id: number;
  title: string;
  description?: string;
  release_year?: number;
  release_date?: string;
  image?: {
    url?: string;
  };
  contributions?: {
    author?: {
      name?: string;
    };
  }[];
}

interface HardcoverGraphQLResponse {
  data?: {
    books?: HardcoverBook[];
    books_by_pk?: HardcoverBook;
  };
}

function toHardcoverCandidate(book: HardcoverBook, targetLang?: string): MetadataCandidate {
  const authors: string[] = [];
  if (book.contributions && Array.isArray(book.contributions)) {
    for (const c of book.contributions) {
      if (c.author?.name) authors.push(c.author.name);
    }
  }

  let firstPublishYear: number | null = null;
  if (book.release_year) {
    firstPublishYear = book.release_year;
  } else if (book.release_date) {
    const parsed = parseInt(book.release_date.slice(0, 4), 10);
    if (!Number.isNaN(parsed)) firstPublishYear = parsed;
  }

  const description = book.description ? cleanDescription(book.description) : null;
  const { partsCount, chaptersCount } = parsePartsAndChapters(description);
  const userLang = targetLang && targetLang !== 'all' ? normalizeLanguageName(targetLang) : null;

  return {
    externalSource: 'hardcover',
    externalId: String(book.id),
    title: book.title,
    authors,
    coverImageUrl: book.image?.url ?? null,
    firstPublishYear,
    description,
    originalLanguage: 'Japanese',
    language: userLang || 'English',
    partsCount,
    chaptersCount,
  };
}

function generateTitleVariants(str: string): string[] {
  const trimmed = str.trim();
  const lower = trimmed.toLowerCase();
  const words = lower.split(/\s+/);

  const titleCase1 = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  const minor = new Set(['of', 'the', 'a', 'an', 'in', 'on', 'at', 'for', 'to', 'and', 'or', 'by', 'with']);
  const titleCase2 = words
    .map((w, idx) => {
      if (idx > 0 && minor.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');

  return Array.from(new Set([trimmed, lower, titleCase1, titleCase2, trimmed.toUpperCase()]));
}

async function searchHardcover(query: string, apiKey: string, targetLang?: string): Promise<MetadataCandidate[]> {
  const variants = generateTitleVariants(query);

  const gqlQuery = `
    query SearchBooks($titles: [String!]!) {
      books(where: {title: {_in: $titles}}, limit: ${MAX_RESULTS}) {
        id
        title
        description
        release_date
        image {
          url
        }
        contributions {
          author {
            name
          }
        }
      }
    }
  `;

  try {
    const response = await fetch('https://api.hardcover.app/v1/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': APP_USER_AGENT,
      },
      body: JSON.stringify({
        query: gqlQuery,
        variables: { titles: variants },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      logger.warn({ status: response.status }, 'Hardcover API search returned non-2xx response');
      return [];
    }

    const body = (await response.json()) as HardcoverGraphQLResponse;
    if (!body.data?.books || !Array.isArray(body.data.books)) return [];
    return body.data.books.slice(0, MAX_RESULTS).map((b) => toHardcoverCandidate(b, targetLang));
  } catch (err) {
    logger.warn({ err }, 'Hardcover API search request failed');
    return [];
  }
}

async function fetchHardcoverDescription(bookId: string): Promise<string | null> {
  const apiKey = env.HARDCOVER_API_KEY;
  if (!apiKey) return null;

  const parsedId = parseInt(bookId, 10);
  if (Number.isNaN(parsedId)) return null;

  const gqlQuery = `
    query GetBook($id: Int!) {
      books_by_pk(id: $id) {
        description
      }
    }
  `;

  try {
    const response = await fetch('https://api.hardcover.app/v1/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': APP_USER_AGENT,
      },
      body: JSON.stringify({
        query: gqlQuery,
        variables: { id: parsedId },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) return null;
    const body = (await response.json()) as HardcoverGraphQLResponse;
    return body.data?.books_by_pk?.description ? cleanDescription(body.data.books_by_pk.description) : null;
  } catch (err) {
    logger.warn({ err }, 'Hardcover book-detail request failed');
    return null;
  }
}

// -----------------------------------------------------------------------------
// Tier 2: Open Library (Default free primary provider)
// -----------------------------------------------------------------------------

interface OpenLibraryDoc {
  key: string;
  title: string;
  author_name?: string[];
  cover_i?: number;
  cover_edition_key?: string;
  isbn?: string[];
  first_publish_year?: number;
  first_sentence?: string | string[] | { value?: string };
}

interface OpenLibrarySearchResponse {
  docs: OpenLibraryDoc[];
}

interface OpenLibraryWorkDetail {
  description?: string | { value: string };
}

const OPEN_LIBRARY_SEARCH_URL = 'https://openlibrary.org/search.json';
const OPEN_LIBRARY_WORKS_URL = 'https://openlibrary.org/works';

function toOpenLibraryCandidate(doc: OpenLibraryDoc, targetLang?: string): MetadataCandidate {
  let coverImageUrl: string | null = null;
  if (doc.cover_i) {
    coverImageUrl = `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`;
  } else if (doc.cover_edition_key) {
    coverImageUrl = `https://covers.openlibrary.org/b/olid/${doc.cover_edition_key}-M.jpg`;
  } else if (doc.isbn && doc.isbn.length > 0) {
    coverImageUrl = `https://covers.openlibrary.org/b/isbn/${doc.isbn[0]}-M.jpg`;
  }

  let description: string | null = null;
  if (doc.first_sentence) {
    if (typeof doc.first_sentence === 'string') {
      description = doc.first_sentence;
    } else if (Array.isArray(doc.first_sentence) && doc.first_sentence.length > 0 && doc.first_sentence[0]) {
      description = doc.first_sentence[0];
    } else if (typeof doc.first_sentence === 'object' && 'value' in doc.first_sentence && typeof doc.first_sentence.value === 'string') {
      description = doc.first_sentence.value;
    }
  }

  const { partsCount, chaptersCount } = parsePartsAndChapters(description);
  const userLang = targetLang && targetLang !== 'all' ? normalizeLanguageName(targetLang) : null;

  return {
    externalSource: 'open-library',
    externalId: doc.key.replace('/works/', ''),
    title: doc.title,
    authors: doc.author_name ?? [],
    coverImageUrl,
    firstPublishYear: doc.first_publish_year ?? null,
    description,
    originalLanguage: 'Japanese',
    language: userLang || 'English',
    partsCount,
    chaptersCount,
  };
}

async function searchOpenLibrary(query: string, targetLang?: string): Promise<MetadataCandidate[]> {
  const fields = 'key,title,author_name,cover_i,cover_edition_key,first_publish_year,isbn,first_sentence';
  let url = `${OPEN_LIBRARY_SEARCH_URL}?q=${encodeURIComponent(query)}&limit=${MAX_RESULTS}&fields=${fields}`;
  if (targetLang && targetLang !== 'all') {
    url += `&language=${encodeURIComponent(targetLang)}`;
  }

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
    return body.docs.slice(0, MAX_RESULTS).map((doc) => toOpenLibraryCandidate(doc, targetLang));
  } catch (err) {
    logger.warn({ err }, 'Open Library response was not valid JSON');
    return [];
  }
}

async function fetchOpenLibraryDescription(externalId: string): Promise<string | null> {
  const url = `${OPEN_LIBRARY_WORKS_URL}/${encodeURIComponent(externalId)}.json`;

  let response: globalThis.Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (err) {
    logger.warn({ err }, 'Open Library work-detail request failed');
    return null;
  }

  if (!response.ok) return null;

  try {
    const body = (await response.json()) as OpenLibraryWorkDetail;
    if (!body.description) return null;
    return typeof body.description === 'string' ? body.description : body.description.value;
  } catch (err) {
    logger.warn({ err }, 'Open Library work-detail response was not valid JSON');
    return null;
  }
}

// -----------------------------------------------------------------------------
// Tier 3: Inventaire.io (Zero-config fallback & rich entity data)
// -----------------------------------------------------------------------------

interface InventaireSearchResult {
  id: string;
  uri: string;
  label: string;
  description?: string;
  image?: string;
}

interface InventaireSearchResponse {
  results?: InventaireSearchResult[];
}

function toInventaireCandidate(item: InventaireSearchResult): MetadataCandidate {
  let authors: string[] = [];
  let firstPublishYear: number | null = null;

  if (item.description) {
    const byMatch = item.description.match(/by\s+([^,;]+)$/i) ?? item.description.match(/by\s+([^,;]+)/i);
    const authorMatch = byMatch?.[1]?.trim();
    if (authorMatch) {
      authors = [authorMatch];
    }
    const yearMatch = item.description.match(/\b(1[89]\d\d|20\d\d)\b/);
    if (yearMatch && yearMatch[1]) {
      firstPublishYear = parseInt(yearMatch[1], 10);
    }
  }

  let coverImageUrl: string | null = null;
  if (item.image) {
    coverImageUrl = item.image.startsWith('http') ? item.image : `https://inventaire.io${item.image}`;
  }

  return {
    externalSource: 'inventaire',
    externalId: item.uri ? item.uri.replace(/^wd:/, '') : item.id,
    title: item.label,
    authors,
    coverImageUrl,
    firstPublishYear,
    description: item.description ?? null,
  };
}

async function searchInventaire(query: string): Promise<MetadataCandidate[]> {
  const url = `https://inventaire.io/api/search?types=works&search=${encodeURIComponent(query)}&limit=${MAX_RESULTS}`;

  let response: globalThis.Response;
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': APP_USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    logger.warn({ err }, 'Inventaire search request failed');
    return [];
  }

  if (!response.ok) {
    logger.warn({ status: response.status }, 'Inventaire returned a non-2xx response');
    return [];
  }

  try {
    const body = (await response.json()) as InventaireSearchResponse;
    if (!body.results || !Array.isArray(body.results)) return [];
    return body.results.slice(0, MAX_RESULTS).map(toInventaireCandidate);
  } catch (err) {
    logger.warn({ err }, 'Inventaire response was not valid JSON');
    return [];
  }
}

async function fetchInventaireDescription(externalId: string): Promise<string | null> {
  const uri = externalId.startsWith('wd:') ? externalId : `wd:${externalId}`;
  const url = `https://inventaire.io/api/entities?action=by-uris&uris=${encodeURIComponent(uri)}`;

  let response: globalThis.Response;
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': APP_USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    logger.warn({ err }, 'Inventaire entity-detail request failed');
    return null;
  }

  if (!response.ok) return null;

  try {
    const body = (await response.json()) as {
      entities?: Record<string, { descriptions?: Record<string, string> | string }>;
    };
    const entity = body.entities?.[uri];
    if (!entity?.descriptions) return null;
    if (typeof entity.descriptions === 'string') return entity.descriptions;
    return entity.descriptions.en ?? Object.values(entity.descriptions)[0] ?? null;
  } catch (err) {
    logger.warn({ err }, 'Inventaire entity-detail response was not valid JSON');
    return null;
  }
}

function detectScriptLanguage(text: string): string {
  if (/[\u0B80-\u0BFF]/.test(text)) return 'ta'; // Tamil
  if (/[\u0900-\u097F]/.test(text)) return 'hi'; // Hindi / Devanagari
  if (/[\u0C00-\u0C7F]/.test(text)) return 'te'; // Telugu
  if (/[\u0D00-\u0D7F]/.test(text)) return 'ml'; // Malayalam
  if (/[\u0C80-\u0CFF]/.test(text)) return 'kn'; // Kannada
  if (/[\u0980-\u09FF]/.test(text)) return 'bn'; // Bengali
  if (/[\u0600-\u06FF]/.test(text)) return 'ar'; // Arabic / Urdu
  if (/[\u0400-\u04FF]/.test(text)) return 'ru'; // Cyrillic
  if (/[\u4E00-\u9FFF]/.test(text)) return 'zh'; // Chinese
  if (/[\u3040-\u30FF]/.test(text)) return 'ja'; // Japanese
  return 'en';
}
function isInventaireCandidateRelevant(candidate: MetadataCandidate, query: string): boolean {
  const desc = (candidate.description ?? '').toLowerCase();
  if (
    desc.includes('inventory of') ||
    desc.includes('museum') ||
    desc.includes('painting') ||
    desc.includes('sculpture') ||
    desc.includes('film') ||
    desc.includes('movie') ||
    desc.includes('administrative')
  ) {
    return false;
  }

  const queryTokens = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/)
    .filter((t) => t.length >= 3);

  if (queryTokens.length === 0) return true;

  const targetText = `${candidate.title} ${candidate.description ?? ''} ${candidate.authors.join(' ')}`.toLowerCase();

  const matchCount = queryTokens.filter((token) => {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    return regex.test(targetText);
  }).length;

  if (queryTokens.length >= 2) {
    return matchCount >= Math.min(2, queryTokens.length);
  }
  return matchCount > 0;
}

// -----------------------------------------------------------------------------
// Tier 3: Wikipedia Books API (Robust multi-language & Romanized Indic literature)
// -----------------------------------------------------------------------------

interface WikipediaSearchItem {
  title: string;
  snippet?: string;
  pageid: number;
}

interface WikipediaSummary {
  title: string;
  titles?: {
    canonical?: string;
    normalized?: string;
  };
  description?: string;
  extract?: string;
  thumbnail?: {
    source: string;
  };
  originalimage?: {
    source: string;
  };
}

function extractTamilAuthor(text: string): string | null {
  const m1 = text.match(/(?:கவிஞர்\s+)?([^\s,;]+(?:\s+[^\s,;]+)?)\s+(?:எழுதிய|இயற்றிய|படைத்த)/u);
  if (m1 && m1[1]) return m1[1].replace(/^[,\s]+|[,\s]+$/g, '');
  const m2 = text.match(/(?:கவிஞர்\s+)?([^\s,;]+?)(?:வின்\s+(?:நாவல்|புதினம்|நூல்|படைப்பு))/u);
  if (m2 && m2[1]) return m2[1].replace(/^[,\s]+|[,\s]+$/g, '');
  return null;
}

async function searchWikipediaBooks(query: string): Promise<MetadataCandidate[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const lang = detectScriptLanguage(trimmed);
  const targetLangs = lang === 'en' ? ['ta', 'en', 'hi'] : [lang, 'en'];
  const candidates: MetadataCandidate[] = [];
  const seenTitles = new Set<string>();

  for (const l of targetLangs) {
    try {
      const sUrl = `https://${l}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        trimmed,
      )}&srlimit=4&format=json`;
      const sRes = await fetch(sUrl, {
        headers: { 'User-Agent': APP_USER_AGENT },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!sRes.ok) continue;
      const sData = (await sRes.json()) as { query?: { search?: WikipediaSearchItem[] } };
      const hits = sData.query?.search || [];

      for (const hit of hits) {
        const cleanSnippet = (hit.snippet || '').replace(/<[^>]+>/g, ' ');
        const snippetLower = cleanSnippet.toLowerCase();
        const titleLower = hit.title.toLowerCase();

        // 1. Immediately disqualify non-book media from title and snippet
        const isDisqualified =
          titleLower.includes('திரைப்படம்') ||
          titleLower.includes('(film)') ||
          titleLower.includes('(movie)') ||
          titleLower.includes('(soundtrack)') ||
          titleLower.includes('(album)') ||
          titleLower.includes('(season') ||
          titleLower.includes('(tv series)') ||
          titleLower.includes('(discography)') ||
          snippetLower.includes('திரைப்படம்') ||
          snippetLower.includes('film directed by') ||
          snippetLower.includes('action drama film') ||
          snippetLower.includes('television') ||
          snippetLower.includes('tv series') ||
          snippetLower.includes('discography') ||
          snippetLower.includes('soundtrack') ||
          snippetLower.includes('actress') ||
          snippetLower.includes('politician');

        if (isDisqualified) continue;

        const sumUrl = `https://${l}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hit.title)}`;
        const sumRes = await fetch(sumUrl, {
          headers: { 'User-Agent': APP_USER_AGENT },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!sumRes.ok) continue;
        const sum = (await sumRes.json()) as WikipediaSummary;

        const sumDesc = (sum.description || '').toLowerCase();
        const sumExtract = (sum.extract || '').toLowerCase();

        // 2. Disqualify based on summary description & extract
        const isDescDisqualified =
          sumDesc.includes('திரைப்படம்') ||
          sumDesc.includes('film') ||
          sumDesc.includes('movie') ||
          sumDesc.includes('actress') ||
          sumDesc.includes('actor') ||
          sumDesc.includes('singer') ||
          sumDesc.includes('album') ||
          sumDesc.includes('discography') ||
          sumDesc.includes('soundtrack') ||
          sumDesc.includes('television') ||
          sumDesc.includes('tv series') ||
          sumDesc.includes('season') ||
          sumDesc.includes('politician') ||
          sumDesc.includes('village') ||
          sumDesc.includes('district') ||
          sumExtract.includes('திரைப்படம் ஆகும்') ||
          sumExtract.includes('திரைக்கு வெளிவந்த') ||
          sumExtract.includes('film directed by') ||
          sumExtract.includes('is an indian actress') ||
          sumExtract.includes('is an indian actor') ||
          sumExtract.startsWith('is a film') ||
          sumExtract.startsWith('is a 20') && sumExtract.includes('film');

        if (isDescDisqualified) continue;

        // 3. Must be positively identified as a book, novel, or literary work
        const isConfirmedBook =
          sumDesc.includes('நாவல்') ||
          sumDesc.includes('புதினம்') ||
          sumDesc.includes('நூல்') ||
          sumDesc.includes('புத்தகம்') ||
          sumDesc.includes('novel') ||
          sumDesc.includes('book') ||
          sumDesc.includes('उपन्यास') ||
          sumDesc.includes('literary work') ||
          sumDesc.includes('written work') ||
          sumDesc.includes('poetry collection') ||
          sumExtract.includes('எழுதிய நாவல்') ||
          sumExtract.includes('எழுதிய புதினம்') ||
          sumExtract.includes('எழுதிய நூல்') ||
          sumExtract.includes('எழுதிய புத்தகம்') ||
          sumExtract.includes('is a novel') ||
          sumExtract.includes('is a book') ||
          sumExtract.includes('historical fiction novel') ||
          sumExtract.includes('written by');

        if (!isConfirmedBook) continue;

        const canonical = sum.titles?.canonical || sum.title;
        if (seenTitles.has(canonical.toLowerCase())) continue;
        seenTitles.add(canonical.toLowerCase());

        let author: string | null = null;
        if (l === 'ta') {
          author =
            extractTamilAuthor(sum.description || '') || extractTamilAuthor(sum.extract || '');
        } else {
          const byM =
            (sum.description || '').match(/by\s+([^,.(]+)/i) ||
            (sum.extract || '').match(/(?:novel|book|work)\s+by\s+([^,.(]+)/i);
          if (byM && byM[1]) author = byM[1].trim();
        }

        let firstPublishYear: number | null = null;
        const yearM = (sum.extract || '').match(/\b(1[89]\d\d|20\d\d)\b/);
        if (yearM && yearM[1]) {
          const parsed = parseInt(yearM[1], 10);
          if (!Number.isNaN(parsed)) firstPublishYear = parsed;
        }

        let displayTitle = sum.title;
        const romanMatch = cleanSnippet.match(/\(([A-Za-z\s'-]{3,35})\)/);
        if (romanMatch && romanMatch[1]) {
          const romanClean = romanMatch[1].replace(/\s+/g, ' ').trim();
          if (romanClean.length >= 3 && !displayTitle.toLowerCase().includes(romanClean.toLowerCase())) {
            displayTitle = `${sum.title} (${romanClean})`;
          }
        }

        const rawCover = sum.thumbnail?.source || sum.originalimage?.source || null;
        const coverImageUrl = rawCover ? (rawCover.split('?')[0] ?? null) : null;

        candidates.push({
          externalSource: 'wikipedia',
          externalId: `${l}:${canonical}`,
          title: displayTitle,
          authors: author ? [author] : [],
          coverImageUrl,
          firstPublishYear,
          description: sum.extract || sum.description || null,
        });
      }

      if (candidates.length >= 3) break;
    } catch (err) {
      logger.warn({ err, lang: l }, 'Wikipedia search failed for language');
    }
  }

  return candidates;
}

async function fetchWikipediaDescription(externalId: string): Promise<string | null> {
  const colonIndex = externalId.indexOf(':');
  const lang = colonIndex > 0 ? externalId.slice(0, colonIndex) : 'en';
  const pageTitle = colonIndex > 0 ? externalId.slice(colonIndex + 1) : externalId;

  const url = `https://${encodeURIComponent(lang)}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': APP_USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as WikipediaSummary;
    return body.extract || body.description || null;
  } catch (err) {
    logger.warn({ err }, 'Wikipedia page-detail request failed');
    return null;
  }
}

// -----------------------------------------------------------------------------
// Public Orchestration & Discovery APIs (ARCHITECTURE.md §11)
// -----------------------------------------------------------------------------



async function searchUniverseWorks(query: string): Promise<MetadataCandidate[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const lang = detectScriptLanguage(trimmed);

  try {
    const sUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(trimmed)}&language=${lang}&type=item&format=json`;
    const sRes = await fetch(sUrl, {
      headers: { 'User-Agent': APP_USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!sRes.ok) return [];
    const sData = (await sRes.json()) as { search?: { id: string; label: string; description?: string }[] };
    const universeEntity = (sData.search || []).find((item) => {
      const desc = (item.description || '').toLowerCase();
      return (
        desc.includes('universe') ||
        desc.includes('franchise') ||
        desc.includes('book series') ||
        desc.includes('novel cycle') ||
        desc.includes('series of fantasy') ||
        desc.includes('series of novels')
      );
    });

    if (!universeEntity) return [];

    const sparql = `
SELECT DISTINCT ?item ?itemLabel ?authorLabel ?pubDate ?desc ?olId ?image WHERE {
  {
    wd:${universeEntity.id} wdt:P1445 ?item .
  } UNION {
    wd:${universeEntity.id} wdt:P527 ?item .
  } UNION {
    ?item wdt:P179 wd:${universeEntity.id} .
  }
  OPTIONAL { ?item wdt:P648 ?olId . }
  OPTIONAL { ?item wdt:P18 ?image . }
  OPTIONAL { ?item wdt:P50 ?author . }
  OPTIONAL { ?item wdt:P577 ?pubDate . }
  OPTIONAL { ?item schema:description ?desc . FILTER(LANG(?desc) = "${lang}" || LANG(?desc) = "en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "${lang},en,[AUTO_LANGUAGE]". }
} LIMIT 25
`;
    const qUrl = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`;
    const qRes = await fetch(qUrl, {
      headers: {
        'User-Agent': APP_USER_AGENT,
        Accept: 'application/sparql-results+json',
      },
      signal: AbortSignal.timeout(SPARQL_TIMEOUT_MS),
    });
    if (!qRes.ok) return [];
    const qData = (await qRes.json()) as {
      results: {
        bindings: {
          item: { value: string };
          itemLabel: { value: string };
          authorLabel?: { value: string };
          pubDate?: { value: string };
          desc?: { value: string };
          olId?: { value: string };
          image?: { value: string };
        }[];
      };
    };

    const candidates: MetadataCandidate[] = [];
    const seen = new Set<string>();

    for (const b of qData.results.bindings) {
      const title = b.itemLabel.value;
      const desc = b.desc?.value ?? '';
      const isTvOrFilm =
        desc.toLowerCase().includes('television') ||
        desc.toLowerCase().includes('film') ||
        desc.toLowerCase().includes('tv series');
      if (isTvOrFilm) continue;
      if (seen.has(title.toLowerCase())) continue;
      seen.add(title.toLowerCase());

      const externalId = b.item.value.split('/').pop() ?? title;
      let coverImageUrl: string | null = null;
      if (b.olId?.value) {
        coverImageUrl = `https://covers.openlibrary.org/b/olid/${b.olId.value}-M.jpg`;
      } else if (b.image?.value) {
        coverImageUrl = b.image.value.replace(/^http:/, 'https:');
      }

      let firstPublishYear: number | null = null;
      if (b.pubDate?.value) {
        const parsed = parseInt(b.pubDate.value.slice(0, 4), 10);
        if (!Number.isNaN(parsed)) firstPublishYear = parsed;
      }

      candidates.push({
        externalSource: 'inventaire',
        externalId,
        title,
        authors: b.authorLabel?.value ? [b.authorLabel.value] : [],
        coverImageUrl,
        firstPublishYear,
        description: desc || null,
        seriesName: universeEntity.label,
      });
    }

    return candidates;
  } catch (err) {
    logger.warn({ err }, 'Wikidata universe works search failed');
    return [];
  }
}

// Discovers related works in the same series, franchise, or fictional universe
// for a given book title, with full multi-language script support.
export async function discoverRelatedBooks(
  title: string,
  author?: string,
): Promise<RelatedDiscoveryResult | null> {
  const cleanTitle = title.replace(/[^\p{L}\p{N}\s'-]/gu, '').trim();
  if (!cleanTitle) return null;
  const lang = detectScriptLanguage(cleanTitle);

  try {
    // 1. Resolve target entity via Wikidata search API for fast, indexed entity lookup
    let qid: string | null = null;
    let targetSeriesName: string | null = null;

    try {
      const sUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(
        cleanTitle,
      )}&language=${lang}&format=json&limit=5`;
      const sRes = await fetch(sUrl, {
        headers: { 'User-Agent': APP_USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (sRes.ok) {
        const sData = (await sRes.json()) as {
          search?: { id: string; label: string; description?: string }[];
        };
        const items = sData.search || [];
        const bookEntity =
          items.find((it) => {
            const d = (it.description || '').toLowerCase();
            return (
              d.includes('novel') ||
              d.includes('book') ||
              d.includes('duology') ||
              d.includes('trilogy') ||
              d.includes('fantasy') ||
              d.includes('series')
            );
          }) || items[0];

        if (bookEntity) {
          qid = bookEntity.id;
          targetSeriesName = bookEntity.label;
        }
      }
    } catch {
      // Fall back to title matching below
    }

    const escapedTitle = cleanTitle.replace(/"/g, '\\"');
    const sparql = qid
      ? `
SELECT DISTINCT ?item ?itemLabel ?seriesLabel ?universeLabel ?olId ?image ?pubDate ?authorLabel ?desc WHERE {
  wd:${qid} (wdt:P179|wdt:P1445|^wdt:P1445) ?container .
  {
    ?item (wdt:P179|wdt:P1445|^wdt:P1445) ?container .
  } UNION {
    ?container wdt:P527 ?item .
  } UNION {
    wd:${qid} (wdt:P155|wdt:P156) ?item .
  }
  OPTIONAL { ?item wdt:P648 ?olId . }
  OPTIONAL { ?item wdt:P18 ?image . }
  OPTIONAL { ?item wdt:P577 ?pubDate . }
  OPTIONAL { ?item wdt:P50 ?author . }
  OPTIONAL { ?item schema:description ?desc . FILTER(LANG(?desc) = "${lang}" || LANG(?desc) = "en") }
  OPTIONAL { ?item wdt:P179 ?series . ?series rdfs:label ?seriesLabel . FILTER(LANG(?seriesLabel) = "${lang}" || LANG(?seriesLabel) = "en") }
  OPTIONAL { ?container rdfs:label ?universeLabel . FILTER(LANG(?universeLabel) = "${lang}" || LANG(?universeLabel) = "en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "${lang},en,[AUTO_LANGUAGE]". }
} LIMIT 30
`
      : `
SELECT DISTINCT ?item ?itemLabel ?seriesLabel ?universeLabel ?olId ?image ?pubDate ?authorLabel ?desc WHERE {
  VALUES ?targetTitle { "${escapedTitle}" "${escapedTitle}"@${lang} "${escapedTitle}"@en }
  ?target rdfs:label ?targetTitle .
  {
    ?target wdt:P179 ?series .
    ?item wdt:P179 ?series .
  } UNION {
    ?target wdt:P179 ?series .
    ?series wdt:P527 ?item .
  } UNION {
    ?universe wdt:P1445 ?target .
    ?universe wdt:P1445 ?item .
  } UNION {
    ?target (wdt:P155|wdt:P156) ?item .
  }
  OPTIONAL { ?item wdt:P648 ?olId . }
  OPTIONAL { ?item wdt:P18 ?image . }
  OPTIONAL { ?item wdt:P577 ?pubDate . }
  OPTIONAL { ?item wdt:P50 ?author . }
  OPTIONAL { ?item schema:description ?desc . FILTER(LANG(?desc) = "${lang}" || LANG(?desc) = "en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "${lang},en,[AUTO_LANGUAGE]". }
} LIMIT 30
`;

    const qUrl = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`;
    const qRes = await fetch(qUrl, {
      headers: {
        'User-Agent': APP_USER_AGENT,
        Accept: 'application/sparql-results+json',
      },
      signal: AbortSignal.timeout(SPARQL_TIMEOUT_MS),
    });

    if (!qRes.ok) return null;
    const qData = (await qRes.json()) as {
      results: {
        bindings: {
          item: { value: string };
          itemLabel: { value: string };
          seriesLabel?: { value: string };
          universeLabel?: { value: string };
          olId?: { value: string };
          image?: { value: string };
          pubDate?: { value: string };
          authorLabel?: { value: string };
          desc?: { value: string };
        }[];
      };
    };

    let discoveredSeriesName: string | null = targetSeriesName;
    const books: RelatedBook[] = [];
    const seen = new Set<string>();
    const lowerCurrentTitle = title.toLowerCase().trim();

    for (const b of qData.results.bindings) {
      const bookTitle = b.itemLabel.value;
      if (bookTitle.toLowerCase().trim() === lowerCurrentTitle) continue;
      const desc = b.desc?.value ?? '';
      const isTvOrFilm =
        desc.toLowerCase().includes('television') ||
        desc.toLowerCase().includes('film') ||
        desc.toLowerCase().includes('tv series');
      if (isTvOrFilm) continue;

      if (!discoveredSeriesName) {
        discoveredSeriesName = b.seriesLabel?.value || b.universeLabel?.value || null;
      }

      if (seen.has(bookTitle.toLowerCase())) continue;
      seen.add(bookTitle.toLowerCase());

      const externalId = b.item.value.split('/').pop() ?? null;
      let coverImageUrl: string | null = null;
      if (b.olId?.value) {
        coverImageUrl = `https://covers.openlibrary.org/b/olid/${b.olId.value}-M.jpg`;
      } else if (b.image?.value) {
        coverImageUrl = b.image.value.replace(/^http:/, 'https:');
      }

      books.push({
        title: bookTitle,
        authors: b.authorLabel?.value ? [b.authorLabel.value] : author ? [author] : [],
        coverImageUrl,
        description: desc || null,
        externalSource: 'inventaire',
        externalId,
      });
    }

    if (!discoveredSeriesName && books.length === 0) return null;

    return {
      seriesName: discoveredSeriesName || title,
      books,
    };
  } catch (err) {
    logger.warn({ err }, 'Failed to discover related books via SPARQL');
    return null;
  }
}

async function searchWikidataBooks(query: string): Promise<MetadataCandidate[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const lang = detectScriptLanguage(trimmed);

  try {
    const sUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(trimmed)}&language=${lang}&type=item&format=json`;
    const sRes = await fetch(sUrl, {
      headers: { 'User-Agent': APP_USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!sRes.ok) return [];
    const sData = (await sRes.json()) as {
      search?: { id: string; label: string; description?: string }[];
    };
    if (!sData.search || sData.search.length === 0) return [];

    const candidates: MetadataCandidate[] = [];
    for (const item of sData.search.slice(0, 10)) {
      const desc = (item.description || '').toLowerCase();
      if (
        desc.includes('film') ||
        desc.includes('television') ||
        desc.includes('tv series') ||
        desc.includes('disambiguation')
      ) {
        continue;
      }

      let authors: string[] = [];
      let firstPublishYear: number | null = null;
      if (item.description) {
        const byMatch =
          item.description.match(/by\s+([^,;]+)$/i) ?? item.description.match(/by\s+([^,;]+)/i);
        if (byMatch && byMatch[1]) {
          authors = [byMatch[1].trim()];
        }
        const yearMatch = item.description.match(/\b(1[89]\d\d|20\d\d)\b/);
        if (yearMatch && yearMatch[1]) {
          firstPublishYear = parseInt(yearMatch[1], 10);
        }
      }

      candidates.push({
        externalSource: 'inventaire',
        externalId: item.id,
        title: item.label,
        authors,
        coverImageUrl: null,
        firstPublishYear,
        description: item.description ?? null,
      });
    }

    return candidates;
  } catch (err) {
    logger.warn({ err }, 'Wikidata books fallback search failed');
    return [];
  }
}

async function enrichMissingCovers(candidates: MetadataCandidate[]): Promise<MetadataCandidate[]> {
  const needsCover = candidates.some((c) => !c.coverImageUrl);
  if (!needsCover) return candidates;

  return Promise.all(
    candidates.map(async (candidate) => {
      if (candidate.coverImageUrl) return candidate;

      const titleTerms = [candidate.title];
      const noSpaces = candidate.title.replace(/\s+/g, '');
      if (noSpaces !== candidate.title) {
        titleTerms.push(noSpaces);
      }

      // Step 1: Open Library cover search
      for (const term of titleTerms) {
        try {
          const olUrl = `${OPEN_LIBRARY_SEARCH_URL}?q=${encodeURIComponent(term)}&limit=3&fields=cover_i,cover_edition_key,isbn`;
          const res = await fetch(olUrl, { signal: AbortSignal.timeout(2500) });
          if (res.ok) {
            const data = (await res.json()) as OpenLibrarySearchResponse;
            if (data.docs && Array.isArray(data.docs)) {
              for (const doc of data.docs) {
                let cover: string | null = null;
                if (doc.cover_i) cover = `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`;
                else if (doc.cover_edition_key) cover = `https://covers.openlibrary.org/b/olid/${doc.cover_edition_key}-M.jpg`;
                else if (doc.isbn && doc.isbn[0]) cover = `https://covers.openlibrary.org/b/isbn/${doc.isbn[0]}-M.jpg`;
                if (cover) {
                  return { ...candidate, coverImageUrl: cover };
                }
              }
            }
          }
        } catch {
          // Continue to next term
        }
      }

      // Step 2: Wikipedia Summary cover search (checking Tamil and English Wikipedia APIs)
      for (const wikiLang of ['ta', 'en']) {
        try {
          const wikiSearchUrl = `https://${wikiLang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(candidate.title)}&format=json&origin=*`;
          const sRes = await fetch(wikiSearchUrl, { signal: AbortSignal.timeout(2500) });
          if (sRes.ok) {
            const sData = (await sRes.json()) as { query?: { search?: { title: string }[] } };
            const pageTitle = sData.query?.search?.[0]?.title;
            if (pageTitle) {
              const sumUrl = `https://${wikiLang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`;
              const sumRes = await fetch(sumUrl, { signal: AbortSignal.timeout(2500) });
              if (sumRes.ok) {
                const sumData = (await sumRes.json()) as { thumbnail?: { source: string }; originalimage?: { source: string } };
                const wikiCover = sumData.thumbnail?.source || sumData.originalimage?.source || null;
                if (wikiCover) {
                  const cleanedCover: string | null = wikiCover.split('?')[0] || null;
                  return { ...candidate, coverImageUrl: cleanedCover };
                }
              }
            }
          }
        } catch {
          // Continue to next Wikipedia language
        }
      }

      return candidate;
    })
  );
}

// Called once per explicit user search (ARCHITECTURE.md §11) — never on
// every page load. Uses a multi-tier waterfall:
// Tier 0: Fictional universe / franchise expansion (e.g. "grishaverse" -> all books).
// Tier 1 (optional): Google Books (if GOOGLE_BOOKS_API_KEY is configured).
// Tier 2 (default): Enhanced Open Library (with multiple cover fallbacks and Unicode support).
// Tier 3 (zero-config fallback): Inventaire.io (if Open Library is down, times out, or returns 0 results).
// Tier 4 (multi-language fallback): Direct Wikidata search (for Tamil and non-Latin scripts).
// On any upstream failure, degrades to an empty result list rather than a 500 (T-013a).
async function translateQuery(query: string, targetLang?: string): Promise<string | null> {
  if (!query || !targetLang || targetLang === 'all' || targetLang === 'en') return null;
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(query)}&langpair=en|${encodeURIComponent(targetLang)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': APP_USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { responseData?: { translatedText?: string } };
    const translated = data.responseData?.translatedText?.trim();
    if (
      translated &&
      translated.toLowerCase() !== query.toLowerCase() &&
      !translated.toUpperCase().includes('MYMEMORY') &&
      !translated.includes('INVALID TARGET LANGUAGE')
    ) {
      return translated;
    }
    return null;
  } catch (err) {
    logger.warn({ err }, 'Query translation attempt failed');
    return null;
  }
}

async function executeWaterfallSearch(trimmed: string, targetLang?: string): Promise<MetadataCandidate[]> {
  // Tier 0: Universe / franchise check (e.g. "grishaverse", "camp half-blood", etc.)
  try {
    const universeCandidates = await searchUniverseWorks(trimmed);
    if (universeCandidates.length >= 3) {
      const mapped = universeCandidates.map((c) => ({
        ...c,
        language: targetLang && targetLang !== 'all' ? normalizeLanguageName(targetLang) : c.language || 'English',
        originalLanguage: c.originalLanguage || 'English',
      }));
      return enrichMissingCovers(mapped);
    }
  } catch (err) {
    logger.warn({ err }, 'Universe search check failed; continuing to standard waterfall');
  }

  // Tier 1: Google Books if an API key is configured
  if (env.GOOGLE_BOOKS_API_KEY) {
    try {
      const googleCandidates = await searchGoogleBooks(trimmed, env.GOOGLE_BOOKS_API_KEY, targetLang);
      if (googleCandidates.length > 0) {
        return enrichMissingCovers(googleCandidates);
      }
    } catch (err) {
      logger.warn({ err }, 'Google Books search failed; falling back to Hardcover');
    }
  }

  // Tier 2: Hardcover API if an API key is configured
  if (env.HARDCOVER_API_KEY) {
    try {
      const hardcoverCandidates = await searchHardcover(trimmed, env.HARDCOVER_API_KEY, targetLang);
      if (hardcoverCandidates.length > 0) {
        return enrichMissingCovers(hardcoverCandidates);
      }
    } catch (err) {
      logger.warn({ err }, 'Hardcover search failed; falling back to Open Library');
    }
  }

  // Tier 3: Open Library (primary free, zero-config provider)
  try {
    const olCandidates = await searchOpenLibrary(trimmed, targetLang);
    if (olCandidates.length > 0) {
      return enrichMissingCovers(olCandidates);
    }
  } catch (err) {
    logger.warn({ err }, 'Open Library search failed; falling back to Wikipedia');
  }

  // Tier 4: Wikipedia Books (robust multi-language, Indic, and Romanized titles)
  try {
    const wikiCandidates = await searchWikipediaBooks(trimmed);
    if (wikiCandidates.length > 0) {
      const mapped = wikiCandidates.map((c) => ({
        ...c,
        language: targetLang && targetLang !== 'all' ? normalizeLanguageName(targetLang) : c.language || 'English',
      }));
      return enrichMissingCovers(mapped);
    }
  } catch (err) {
    logger.warn({ err }, 'Wikipedia books search failed; falling back to Inventaire');
  }

  // Tier 5: Inventaire.io (zero-config fallback with relevance validation)
  try {
    const invCandidates = await searchInventaire(trimmed);
    const relevantInv = invCandidates.filter((c) => isInventaireCandidateRelevant(c, trimmed));
    if (relevantInv.length > 0) {
      const mapped = relevantInv.map((c) => ({
        ...c,
        language: targetLang && targetLang !== 'all' ? normalizeLanguageName(targetLang) : c.language || 'English',
      }));
      return enrichMissingCovers(mapped);
    }
  } catch (err) {
    logger.warn({ err }, 'Inventaire search failed; falling back to Wikidata');
  }

  // Tier 6: Direct Wikidata search fallback (robust for Tamil and non-Latin scripts)
  try {
    const wdCandidates = await searchWikidataBooks(trimmed);
    if (wdCandidates.length > 0) {
      const mapped = wdCandidates.map((c) => ({
        ...c,
        language: targetLang && targetLang !== 'all' ? normalizeLanguageName(targetLang) : c.language || 'English',
      }));
      return enrichMissingCovers(mapped);
    }
  } catch (err) {
    logger.warn({ err }, 'Wikidata fallback search failed');
  }

  return [];
}

// Called once per explicit user search (ARCHITECTURE.md §11) — never on
// every page load. Uses a multi-tier waterfall:
// Tier 0: Fictional universe / franchise expansion (e.g. "grishaverse" -> all books).
// Tier 1 (optional): Google Books (if GOOGLE_BOOKS_API_KEY is configured).
// Tier 2 (default): Enhanced Open Library (with multiple cover fallbacks and Unicode support).
// Tier 3 (zero-config fallback): Inventaire.io (if Open Library is down, times out, or returns 0 results).
// Tier 4 (multi-language fallback): Direct Wikidata search (for Tamil and non-Latin scripts).
// On any upstream failure, degrades to an empty result list rather than a 500 (T-013a).
export async function searchBookMetadata(query: string, targetLang?: string): Promise<MetadataCandidate[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  let searchTerms = [trimmed];
  if (targetLang && targetLang !== 'all') {
    const translated = await translateQuery(trimmed, targetLang);
    if (translated && translated.toLowerCase() !== trimmed.toLowerCase()) {
      searchTerms = [translated, trimmed];
    }
  }

  const allCandidates: MetadataCandidate[] = [];
  const seenKeys = new Set<string>();

  for (const term of searchTerms) {
    const candidatesForTerm = await executeWaterfallSearch(term, targetLang);
    for (const c of candidatesForTerm) {
      const key = `${c.title.toLowerCase()}-${(c.authors || []).join(',').toLowerCase()}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        allCandidates.push(c);
      }
    }
    if (allCandidates.length >= 5) break;
  }

  return allCandidates;
}

// Fetches book synopsis / description once per add, supporting Google Books,
// Hardcover, Inventaire, Wikipedia, and Open Library.
export async function fetchWorkDescription(
  sourceOrExternalId: string,
  maybeExternalId?: string,
): Promise<string | null> {
  const source = maybeExternalId ? sourceOrExternalId : 'open-library';
  const externalId = maybeExternalId ?? sourceOrExternalId;

  if (source === 'google-books') {
    return fetchGoogleBooksDescription(externalId);
  }
  if (source === 'hardcover') {
    return fetchHardcoverDescription(externalId);
  }
  if (source === 'inventaire') {
    return fetchInventaireDescription(externalId);
  }
  if (source === 'wikipedia') {
    return fetchWikipediaDescription(externalId);
  }
  return fetchOpenLibraryDescription(externalId);
}

