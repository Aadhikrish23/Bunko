import { BaseTool } from '../../../sdk/BaseTool';
import type { AIToolContext } from '../../../sdk/AIToolContext';
import type { AIToolResult } from '../../../sdk/AIToolResult';
import { discoverRelatedBooks } from '../../../../metadata/metadata.service';
import conversationManager from '../../../conversation/ConversationManager';
import { loadLibrary, loadShelves, type BookRecord } from '../data/library';
import { STATUS_LABEL } from '../data/status';
import { answerFromLibrary, searchBooks, titlesOf } from '../conversation/libraryAnswers';
import { norm } from '../text/match';

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

interface Pick {
  book: BookRecord;
  score: number;
  reason: string;
}

/** Why a to-read book suits this reader: authors and genres of what they loved, series they're in. */
function rankToRead(books: BookRecord[], hint: string): Pick[] {
  const loved = books.filter((b) => b.isFavourite || (b.rating ?? 0) >= 4);
  const lovedAuthors = new Map<string, string>();
  for (const b of loved) for (const a of b.authors) lovedAuthors.set(norm(a), b.title);
  const lovedGenres = new Map<string, number>();
  for (const b of loved) for (const g of b.genres) lovedGenres.set(norm(g), (lovedGenres.get(norm(g)) ?? 0) + 1);
  const finishedSeries = new Set(books.filter((b) => b.status === 'FINISHED' && b.seriesName).map((b) => norm(b.seriesName!)));
  const hintWords = norm(hint).split(' ').filter((w) => w.length >= 4);

  return books
    .filter((b) => b.status === 'WANT_TO_READ')
    .map((book) => {
      let score = 0;
      let reason = 'it has been waiting on your Want to Read list';
      const author = book.authors.find((a) => lovedAuthors.has(norm(a)));
      const genre = book.genres.find((g) => lovedGenres.has(norm(g)));
      if (book.seriesName && finishedSeries.has(norm(book.seriesName))) {
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
    const hint = input.query ?? '';
    const picks = rankToRead(books, hint).slice(0, 3);
    const lines = picks.map((p) => `- ${p.book.title}${p.book.authors[0] ? ` by ${p.book.authors[0]}` : ''}: ${p.reason}.`);

    // The next book in a series they just finished, even if it isn't in the library yet.
    const lastSeries = books.find((b) => b.status === 'FINISHED' && b.seriesName);
    let next: string | undefined;
    if (lastSeries) {
      const related = await Promise.race([
        discoverRelatedBooks(lastSeries.title, lastSeries.authors[0]).catch(() => null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 6_000)),
      ]);
      const owned = new Set(books.map((b) => norm(b.title)));
      const candidate = related?.books.find((b) => !owned.has(norm(b.title)));
      if (candidate) next = `${candidate.title}${candidate.authors[0] ? ` by ${candidate.authors[0]}` : ''}`;
    }

    if (lines.length === 0 && !next) {
      return this.success(
        { titles: [] },
        books.length === 0
          ? 'Add a few books first and I can suggest what to read next.'
          : 'Your Want to Read list is empty, so I have nothing to pick from yet. Add some books you\'re curious about and ask again.',
      );
    }
    const parts: string[] = [];
    if (lines.length) parts.push(`From your Want to Read list, I'd start with:\n${lines.join('\n')}`);
    if (next) parts.push(`You finished ${lastSeries!.title}; the series continues with ${next}. Say "add ${next.split(' by ')[0]}" if you'd like it.`);
    return this.success({ titles: picks.map((p) => p.book.title) }, parts.join('\n\n'));
  }
}
