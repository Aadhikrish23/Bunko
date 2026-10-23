import { prisma } from '../../../../../config/prisma';
import type { LibrarySnapshot } from '../../../context/LibrarySnapshot';
import { STATUS_LABEL, type ReadingStatus } from './status';

/**
 * One book in the reader's library, as the assistant sees it. `_id` (the work id) and `title`
 * are what the core's entity resolution and clarification options read.
 */
export interface BookRecord {
  _id: string;
  title: string;
  authors: string[];
  status: ReadingStatus;
  shelves: { id: string; name: string }[];
  rating: number | null;
  reviewBody: string | null;
  isFavourite: boolean;
  noteCount: number;
  genres: string[];
  seriesName: string | null;
  addedAt: Date;
  finishedAt: Date | null;
}

/** The whole library, newest first, in one query (a reader's library is hundreds of books, not millions). */
export async function loadLibrary(userId: string): Promise<BookRecord[]> {
  const rows = await prisma.userWork.findMany({
    where: { userId },
    orderBy: { addedAt: 'desc' },
    include: {
      shelves: { include: { shelf: true } },
      work: {
        include: {
          authors: { include: { author: true } },
          series: true,
          reviews: { where: { userId } },
          notes: { where: { userId }, select: { id: true } },
        },
      },
    },
  });
  return rows.map((row) => {
    const review = row.work.reviews[0];
    return {
      _id: row.workId,
      title: row.work.title,
      authors: row.work.authors.map((a) => a.author.name),
      status: row.status as ReadingStatus,
      shelves: row.shelves.map((s) => ({ id: s.shelf.id, name: s.shelf.name })),
      rating: review?.rating ?? null,
      reviewBody: review?.body ?? null,
      isFavourite: review?.isFavourite ?? false,
      noteCount: row.work.notes.length,
      genres: row.work.genres,
      seriesName: row.work.series?.name ?? null,
      addedAt: row.addedAt,
      finishedAt: row.finishedAt,
    };
  });
}

export async function loadShelves(userId: string): Promise<{ id: string; name: string }[]> {
  return prisma.shelf.findMany({ where: { userId }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
}

/** How many books the model sees by name; the rest are counted. */
const SNAPSHOT_BOOKS = 150;

/** What the planner sees: titles (with authors, so "the Sanderson one" works), statuses, shelves. */
export async function loadSnapshot(userId: string): Promise<LibrarySnapshot> {
  const [books, shelves] = await Promise.all([loadLibrary(userId), loadShelves(userId)]);
  return snapshotOf(books, shelves);
}

export function snapshotOf(books: BookRecord[], shelves: { name: string }[]): LibrarySnapshot {
  return {
    // The author rides along in the status line, so titles stay exactly as stored.
    books: books.slice(0, SNAPSHOT_BOOKS).map((b) => ({
      title: b.title,
      status: b.authors.length ? `${STATUS_LABEL[b.status]} · by ${b.authors.slice(0, 2).join(', ')}` : STATUS_LABEL[b.status],
    })),
    totalBooks: books.length,
    collections: shelves.map((s) => s.name),
  };
}

export function snapshotTitles(snapshot?: LibrarySnapshot): string[] {
  return (snapshot?.books ?? []).map((b) => b.title);
}
