import { EntityResolutionStatus } from '../../../entity/EntityResolutionStatus';
import type { EntityResolutionResult } from '../../../entity/EntityResolutionResult';
import memoryAliasResolver from '../../../memory/MemoryAliasResolver';
import conversationManager from '../../../conversation/ConversationManager';
import { loadLibrary, type BookRecord } from '../data/library';
import { norm, rankByTitle } from '../text/match';

const result = (
  status: EntityResolutionStatus,
  confidence: number,
  entity?: BookRecord,
  candidates?: BookRecord[],
  reasoning?: string,
): EntityResolutionResult<BookRecord> => ({ status, confidence, entity, candidates, reasoning });

/** Words that point at an author rather than a title: "the sanderson one", "pratchett's book". */
function authorWords(query: string): string[] {
  return norm(query)
    .replace(/\b(the|new|latest|last|one|book|books|novel|by|s)\b/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4);
}

/**
 * "dune", "hail mary", "projcet hail mary", "the new sanderson" -> one of the reader's books,
 * candidates to ask about, or not found. Only ever the reader's own library (SRS §25.2).
 */
export async function resolveBook(
  userId: string,
  query: string,
  options?: { isBulk?: boolean },
): Promise<EntityResolutionResult<BookRecord>> {
  const books = await loadLibrary(userId);
  if (books.length === 0) return result(EntityResolutionStatus.NOT_FOUND, 0, undefined, undefined, 'Empty library');

  // "all my Discworld books": every title or series that contains the words.
  if (options?.isBulk) {
    const q = norm(query).replace(/\b(all|my|every|the|books?|series)\b/g, ' ').trim();
    const matched = books.filter((b) => q && (norm(b.title).includes(q) || norm(b.seriesName ?? '').includes(q)));
    if (matched.length > 0) {
      const bulk = result(EntityResolutionStatus.RESOLVED, 1, matched[0], matched, `Bulk: ${matched.length} books`);
      (bulk as { isBulk?: boolean }).isBulk = true;
      return bulk;
    }
  }

  // "it" / a name the conversation already pinned to a book, then learned aliases.
  const session = await conversationManager.getOrCreateSession(userId);
  const aliased = (await memoryAliasResolver.resolve(userId, query, books as never[], session)) as BookRecord | null;
  if (aliased) return result(EntityResolutionStatus.RESOLVED, 1, aliased, undefined, 'Conversation reference or alias');

  const ranked = rankByTitle(query, books);
  const top = ranked[0];
  const second = ranked[1];
  if (top && top.score >= 97) {
    // Two editions/books with the same exact title: ask.
    const same = ranked.filter((r) => r.score === top.score).map((r) => r.item);
    return same.length > 1
      ? result(EntityResolutionStatus.AMBIGUOUS, 0.5, undefined, same, 'Several exact title matches')
      : result(EntityResolutionStatus.RESOLVED, 1, top.item, undefined, 'Exact title');
  }
  if (top && top.score >= 80 && (!second || top.score - second.score >= 8)) {
    return result(EntityResolutionStatus.RESOLVED, top.score / 100, top.item, undefined, `Title match ${top.score}`);
  }

  // An author instead of a title.
  const words = authorWords(query);
  if (words.length > 0 && (!top || top.score < 80)) {
    const byAuthor = books.filter((b) => b.authors.some((a) => words.some((w) => norm(a).split(' ').includes(w))));
    if (byAuthor.length === 1) return result(EntityResolutionStatus.RESOLVED, 0.9, byAuthor[0], undefined, 'Only book by that author');
    if (byAuthor.length > 1) {
      return result(EntityResolutionStatus.AMBIGUOUS, 0.6, undefined, byAuthor.slice(0, 6), 'Several books by that author');
    }
  }

  const close = ranked.filter((r) => r.score >= 75);
  if (close.length > 0) {
    return result(EntityResolutionStatus.AMBIGUOUS, (top?.score ?? 0) / 100, undefined, close.slice(0, 5).map((r) => r.item), 'Close titles');
  }
  return result(EntityResolutionStatus.NOT_FOUND, 0, undefined, undefined, `No book like "${query}"`);
}
