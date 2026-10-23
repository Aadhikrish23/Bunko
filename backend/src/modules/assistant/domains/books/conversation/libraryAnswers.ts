import { prisma } from '../../../../../config/prisma';
import type { BookRecord } from '../data/library';
import { STATUS_LABEL, type ReadingStatus } from '../data/status';
import { listJoin, matchShelf, namedTitles, norm } from '../text/match';

// Questions about the reader's own library, answered from their data -- never from the model,
// so counts, ratings and lists are always right (SRS §20.6 "answers questions from the
// reader's own data").

const LIST_LIMIT = 12;

function titlesOf(books: BookRecord[]): string {
  const names = books.slice(0, LIST_LIMIT).map((b) => b.title);
  const more = books.length - names.length;
  return more > 0 ? `${names.join(', ')} and ${more} more` : listJoin(names);
}

function countWord(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

const STATUS_ASKS: { pattern: RegExp; status: ReadingStatus; none: string; some: (n: number) => string }[] = [
  {
    pattern: /\b(what am i (currently )?reading|currently reading|reading right now|reading at the moment|in progress|what i'?m reading)\b/,
    status: 'READING',
    none: "You're not reading anything right now.",
    some: (n) => `You're reading ${countWord(n, 'book')}:`,
  },
  {
    pattern: /\b(tbr|to be read|to-?read|want to read|reading list|backlog|what should i read from|unread)\b/,
    status: 'WANT_TO_READ',
    none: 'Your Want to Read list is empty.',
    some: (n) => `You have ${countWord(n, 'book')} on your Want to Read list:`,
  },
  {
    pattern: /\b(dnf|did ?n[o']?t finish|gave up on|abandoned|didn'?t finish)\b/,
    status: 'DID_NOT_FINISH',
    none: "You haven't marked any books Did Not Finish.",
    some: (n) => `You didn't finish ${countWord(n, 'book')}:`,
  },
  {
    pattern: /\b(what (books )?(have i|did i) (finish|finished|read)|books i'?ve (finished|read)|finished books|what i'?ve read|have i read)\b/,
    status: 'FINISHED',
    none: "You haven't marked any books Finished yet.",
    some: (n) => `You've finished ${countWord(n, 'book')}:`,
  },
];

/**
 * Books finished this calendar year: by the date they were marked Finished, or for books
 * finished before Bunko kept that date, by their last reading session. Undefined when no
 * finished book has either (nothing to go on).
 */
async function finishedThisYear(userId: string, books: BookRecord[]): Promise<BookRecord[] | undefined> {
  const finished = books.filter((b) => b.status === 'FINISHED');
  if (finished.length === 0) return [];
  const start = new Date(new Date().getFullYear(), 0, 1);
  const undated = finished.filter((b) => !b.finishedAt);
  const lastSession = new Map<string, Date>();
  if (undated.length > 0) {
    const sessions = await prisma.readingSession.groupBy({
      by: ['journeyId'],
      where: { userId, endTime: { not: null }, journey: { workId: { in: undated.map((b) => b._id) } } },
      _max: { endTime: true },
    });
    const journeys = await prisma.readingJourney.findMany({
      where: { id: { in: sessions.map((s) => s.journeyId) } },
      select: { id: true, workId: true },
    });
    const workByJourney = new Map(journeys.map((j) => [j.id, j.workId]));
    for (const s of sessions) {
      const workId = workByJourney.get(s.journeyId);
      if (workId && s._max.endTime) lastSession.set(workId, s._max.endTime);
    }
  }
  const when = (b: BookRecord) => b.finishedAt ?? lastSession.get(b._id) ?? null;
  if (finished.every((b) => when(b) === null)) return undefined;
  return finished.filter((b) => (when(b) ?? 0) >= start);
}

export interface AnswerContext {
  userId: string;
  books: BookRecord[];
  shelves: { id: string; name: string }[];
  /** The book the conversation is about, for "what did I rate it?". */
  currentTitle?: string | null;
}

/** An answer from the reader's data, or undefined when the question isn't about their records. */
export async function answerFromLibrary(question: string, ctx: AnswerContext): Promise<string | undefined> {
  const q = norm(question).replace(/\bi m\b/g, "i'm").replace(/\bive\b/g, "i've");
  const raw = question.toLowerCase();
  const { books, shelves } = ctx;
  if (books.length === 0 && /\b(my|i)\b/.test(q) && /\b(book|books|library|read|reading|shelf|shelves|tbr)\b/.test(q)) {
    return 'Your library is empty so far. Say "add" and a title to start, like "add Piranesi".';
  }

  const titles = books.map((b) => b.title);
  const named = namedTitles(question, titles);
  const pointsBack = /\b(it|that one|this one|that book|this book)\b/.test(q) && ctx.currentTitle ? ctx.currentTitle : undefined;
  const about = books.find((b) => b.title === (named[0] ?? pointsBack));

  // About one book: rating, review, status, author, shelves, notes.
  if (about) {
    if (/\b(rate|rated|rating|stars?|score)\b/.test(q)) {
      return about.rating ? `You rated ${about.title} ${countWord(about.rating, 'star')}.` : `You haven't rated ${about.title} yet.`;
    }
    if (/\b(review|reviewed)\b/.test(q)) {
      if (about.reviewBody) return `Your review of ${about.title}: "${about.reviewBody}"`;
      return about.rating ? `You rated ${about.title} ${countWord(about.rating, 'star')} but didn't write a review.` : `You haven't reviewed ${about.title}.`;
    }
    if (/\b(who wrote|author|written by|by whom)\b/.test(q)) {
      return about.authors.length ? `${about.title} is by ${listJoin(about.authors)}.` : `I don't have an author recorded for ${about.title}.`;
    }
    if (/\b(note|notes)\b/.test(q)) {
      const notes = await prisma.note.findMany({
        where: { userId: ctx.userId, workId: about._id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { body: true },
      });
      if (notes.length === 0) return `You haven't written any notes on ${about.title}.`;
      return `Your notes on ${about.title}:\n${notes.map((n) => `- ${n.body}`).join('\n')}`;
    }
    if (/\b(shelf|shelves)\b/.test(q)) {
      return about.shelves.length
        ? `${about.title} is on ${listJoin(about.shelves.map((s) => `"${s.name}"`))}.`
        : `${about.title} isn't on any shelf.`;
    }
    if (/\b(status|finished|have i read|did i (read|finish)|am i reading|on my)\b/.test(q)) {
      return `${about.title} is marked ${STATUS_LABEL[about.status]}.`;
    }
  }

  // Shelves: "what shelves do I have", "what's on my sci-fi shelf".
  if (/\b(shelf|shelves)\b/.test(q)) {
    const shelfName = raw.match(/(?:on|in) (?:my |the )?["“]?(.+?)["”]? shel(?:f|ves)\b/)?.[1];
    const shelf = shelfName ? matchShelf(shelfName, shelves) : undefined;
    if (shelf) {
      const onIt = books.filter((b) => b.shelves.some((s) => s.id === shelf.id));
      return onIt.length ? `On "${shelf.name}" (${countWord(onIt.length, 'book')}): ${titlesOf(onIt)}.` : `Your "${shelf.name}" shelf is empty.`;
    }
    if (/\b(what|which|list|my|show|how many)\b/.test(q) && !shelfName) {
      if (shelves.length === 0) return 'You don\'t have any shelves yet. Say "create a shelf called ..." to make one.';
      const counted = shelves.map((s) => `"${s.name}" (${books.filter((b) => b.shelves.some((x) => x.id === s.id)).length})`);
      return `You have ${countWord(shelves.length, 'shelf', 'shelves')}: ${listJoin(counted)}.`;
    }
  }

  // Counts and status lists.
  if (/\bhow many\b/.test(q) && /\b(book|books|library|read|finished)\b/.test(q)) {
    if (/\bthis year\b/.test(q) && /\b(read|finish|finished)\b/.test(q)) {
      const thisYear = await finishedThisYear(ctx.userId, books);
      if (thisYear === undefined) {
        const finished = books.filter((b) => b.status === 'FINISHED');
        return `You've marked ${countWord(finished.length, 'book')} Finished in all, but none has a finish date yet. Books you mark Finished from now on are dated.`;
      }
      return thisYear.length
        ? `You've finished ${countWord(thisYear.length, 'book')} this year: ${titlesOf(thisYear)}.`
        : "You haven't finished a book this year yet.";
    }
    const by = (s: ReadingStatus) => books.filter((b) => b.status === s).length;
    if (/\b(finished|read)\b/.test(q) && !/\breading\b/.test(q)) return `You've finished ${countWord(by('FINISHED'), 'book')}.`;
    return `You have ${countWord(books.length, 'book')}: ${by('READING')} reading, ${by('WANT_TO_READ')} want to read, ${by('FINISHED')} finished, ${by('DID_NOT_FINISH')} not finished.`;
  }

  for (const ask of STATUS_ASKS) {
    if (!ask.pattern.test(raw) && !ask.pattern.test(q)) continue;
    // "what should I read next" is a recommendation, not a list.
    if (ask.status === 'WANT_TO_READ' && /\b(next|recommend|suggest|should i)\b/.test(q)) return undefined;
    const matching = books.filter((b) => b.status === ask.status);
    return matching.length ? `${ask.some(matching.length)} ${titlesOf(matching)}.` : ask.none;
  }

  if (/\b(favou?rites?|top rated|best rated|highest rated|loved|5 star|five star)\b/.test(q)) {
    const loved = books.filter((b) => b.isFavourite || b.rating === 5);
    if (loved.length) return `Your favourites and 5-star books: ${titlesOf(loved)}.`;
    const rated = books.filter((b) => b.rating).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    return rated.length ? `Your highest rated: ${titlesOf(rated.slice(0, 5))}.` : "You haven't rated any books yet.";
  }

  if (/\b(last|latest|recently|most recent)\b.*\b(added|add)\b|\bwhat did i (just )?add\b/.test(q)) {
    return books.length ? `The last books you added: ${titlesOf(books.slice(0, 5))}.` : undefined;
  }

  if (/\b(do i have|is .+ in my library|have i got|do i own)\b/.test(q)) {
    if (about) return `Yes, ${about.title} is in your library (${STATUS_LABEL[about.status]}).`;
  }
  return undefined;
}

/** Books matching a search: title, author, genre, series, or shelf. */
export function searchBooks(term: string, books: BookRecord[]): BookRecord[] {
  const t = norm(term);
  if (!t) return [];
  return books.filter((b) =>
    [b.title, ...b.authors, ...b.genres, b.seriesName ?? '', ...b.shelves.map((s) => s.name)].some((field) => norm(field).includes(t)),
  );
}

export { titlesOf };
