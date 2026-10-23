import { BaseTool } from '../../../sdk/BaseTool';
import type { AIToolContext } from '../../../sdk/AIToolContext';
import type { AIToolResult } from '../../../sdk/AIToolResult';
import conversationManager from '../../../conversation/ConversationManager';
import { loadLibrary, loadShelves, type BookRecord } from '../data/library';
import { STATUS_LABEL } from '../data/status';
import { answerFromLibrary, searchBooks, titlesOf } from '../conversation/libraryAnswers';
import { namedTitles, norm } from '../text/match';

export class SearchLibraryTool extends BaseTool<{ searchValue: string }, { titles: string[] }> {
  readonly category = 'library';
  readonly name = 'search_library';
  readonly description = "Finds books in the reader's library by title, author, genre, series or shelf.";

  async execute(input: { searchValue: string }, context: AIToolContext): Promise<AIToolResult<{ titles: string[] }>> {
    const term = (input.searchValue || '').trim();
    if (!term) return this.failure('What should I look for in your library?');
    const found = searchBooks(term, await loadLibrary(context.userId));
    const titles = found.map((b) => b.title);
    if (found.length === 0) return this.success({ titles }, `Nothing in your library matches "${term}".`);
    const detail = found.length <= 5 ? found.map((b) => `${b.title} (${STATUS_LABEL[b.status]})`).join(', ') : titlesOf(found);
    return this.success({ titles }, `${found.length === 1 ? 'One book matches' : `${found.length} books match`} "${term}": ${detail}.`);
  }
}

export class LibraryQuestionTool extends BaseTool<{ question?: string }, { answered: boolean }> {
  readonly category = 'library';
  readonly name = 'library_question';
  readonly description = "Answers a question about the reader's own library from their data.";

  async execute(input: { question?: string }, context: AIToolContext): Promise<AIToolResult<{ answered: boolean }>> {
    const [books, shelves, session] = await Promise.all([
      loadLibrary(context.userId),
      loadShelves(context.userId),
      conversationManager.getOrCreateSession(context.userId),
    ]);
    const answer = await answerFromLibrary(input.question ?? '', {
      userId: context.userId,
      books,
      shelves,
      currentTitle: session.references.currentBook?.displayName ?? null,
    });
    if (answer) return this.success({ answered: true }, answer);
    const by = (s: BookRecord['status']) => books.filter((b) => b.status === s).length;
    return this.success(
      { answered: false },
      `I'm not sure how to answer that from your library. You have ${books.length} books (${by('READING')} reading, ${by('WANT_TO_READ')} want to read, ${by('FINISHED')} finished). Try asking what you're reading, what's on your Want to Read list, or what you rated a book.`,
    );
  }
}

const WAITING = 'waiting';

interface Pick {
  book: BookRecord;
  score: number;
  reason: string;
}

/**
 * Why a to-read book suits this reader: a book they named ("something like Piranesi") first,
 * then authors and genres of what they loved, then series they're already in.
 */
function rankToRead(books: BookRecord[], hint: string): Pick[] {
  const loved = books.filter((b) => b.isFavourite || (b.rating ?? 0) >= 4);
  const lovedAuthors = new Map<string, string>();
  for (const b of loved) for (const a of b.authors) lovedAuthors.set(norm(a), b.title);
  const lovedGenres = new Map<string, number>();
  for (const b of loved) for (const g of b.genres) lovedGenres.set(norm(g), (lovedGenres.get(norm(g)) ?? 0) + 1);
  const finishedSeries = new Set(books.filter((b) => b.status === 'FINISHED' && b.seriesName).map((b) => norm(b.seriesName!)));
  // "like Piranesi": the reader's own copy of the book they named, if they have it.
  const like = namedTitles(hint, books.map((b) => b.title))
    .map((t) => books.find((b) => b.title === t))
    .find((b): b is BookRecord => Boolean(b));
  const hintWords = norm(hint)
    .split(' ')
    .filter((w) => w.length >= 4 && !(like && norm(like.title).includes(w)));

  return books
    .filter((b) => b.status === 'WANT_TO_READ' && b !== like)
    .map((book) => {
      let score = 0;
      let reason = WAITING;
      const author = book.authors.find((a) => lovedAuthors.has(norm(a)));
      const genre = book.genres.find((g) => lovedGenres.has(norm(g)));
      const likeAuthor = like && book.authors.find((a) => like.authors.some((x) => norm(x) === norm(a)));
      const likeGenre = like && book.genres.find((g) => like.genres.some((x) => norm(x) === norm(g)));
      if (likeAuthor) {
        score += 8;
        reason = `it's by ${likeAuthor}, like ${like!.title}`;
      } else if (likeGenre) {
        score += 7;
        reason = `it's ${likeGenre}, like ${like!.title}`;
      } else if (book.seriesName && finishedSeries.has(norm(book.seriesName))) {
        score += 5;
        reason = `you've already finished a book in the ${book.seriesName} series`;
      } else if (author) {
        score += 4;
        reason = `you loved ${lovedAuthors.get(norm(author))}, also by ${author}`;
      } else if (genre) {
        score += 2 + (lovedGenres.get(norm(genre)) ?? 0) * 0.1;
        reason = `you've rated ${genre} books highly`;
      }
      // "something fantasy", "a short one by Le Guin": words that match the book itself count most.
      const fields = norm([book.title, ...book.authors, ...book.genres, book.seriesName ?? ''].join(' '));
      if (hintWords.some((w) => fields.includes(w))) score += 6;
      // Older additions first among equals: they've waited longest.
      score += Math.min(1, (Date.now() - book.addedAt.getTime()) / (365 * 86_400_000));
      return { book, score, reason };
    })
    .sort((a, b) => b.score - a.score);
}

export class RecommendBooksTool extends BaseTool<{ query?: string }, { titles: string[] }> {
  readonly category = 'recommendation';
  readonly name = 'recommend_books';
  readonly description = "Suggests what to read next from the reader's Want to Read list and their own taste.";

  async execute(input: { query?: string }, context: AIToolContext): Promise<AIToolResult<{ titles: string[] }>> {
    const books = await loadLibrary(context.userId);
    const ranked = rankToRead(books, input.query ?? '');
    if (ranked.length === 0) {
      return this.success(
        { titles: [] },
        books.length === 0
          ? 'Add a few books first and I can suggest what to read next.'
          : "Your Want to Read list is empty, so there's nothing on it to pick from yet. Add a few books you're curious about and ask again.",
      );
    }
    const byLine = (p: Pick) => `${p.book.title}${p.book.authors[0] ? ` by ${p.book.authors[0]}` : ''}`;
    // Only real reasons are given; with none, say once why these ones.
    const reasoned = ranked.filter((p) => p.reason !== WAITING).slice(0, 3);
    if (reasoned.length > 0) {
      const others = ranked.filter((p) => p.reason === WAITING).slice(0, 3 - Math.min(3, reasoned.length) || 2);
      const lines = reasoned.map((p) => `- ${byLine(p)}: ${p.reason}.`);
      const also = others.length ? `\n\nAlso waiting on your list: ${others.map((p) => p.book.title).join(', ')}.` : '';
      return this.success({ titles: reasoned.map((p) => p.book.title) }, `From your Want to Read list, I'd start with:\n${lines.join('\n')}${also}`);
    }
    const picks = ranked.slice(0, 3);
    return this.success(
      { titles: picks.map((p) => p.book.title) },
      `Your ratings don't point at any of these yet, so here are the ones that have waited longest on your Want to Read list:\n${picks.map((p) => `- ${byLine(p)}`).join('\n')}`,
    );
  }
}
