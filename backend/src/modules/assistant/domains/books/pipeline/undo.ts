import type { IntentPlan } from '../../../intent/IntentPlan';
import { IntentTargetType } from '../../../intent/IntentTargetType';
import { prisma } from '../../../../../config/prisma';
import { deleteWork, updateWork } from '../../../../library/library.service';
import { deleteReview, upsertReview } from '../../../../reviews/reviews.service';
import { deleteNote } from '../../../../notes/notes.service';
import { assignWorkToShelf, deleteShelf, removeWorkFromShelf } from '../../../../shelves/shelves.service';
import { BookIntent } from '../intent/BookIntent';
import { STATUS_LABEL, type ReadingStatus } from '../data/status';
import { listJoin, rankByTitle } from '../text/match';

// "undo" (T-104): what the last message's plan was about to change is snapshotted before it
// runs; "undo" puts every one of those books back exactly as it was -- status, rating and
// review, notes, shelves -- removes books that plan added, and deletes shelves it created
// (if still empty). One level: the last change only, for half an hour.

export const UNDO_ASK = /^\s*(?:please\s+)?(undo|undo (that|it|this|the last (one|change|thing))|revert( that| it)?|take (that|it) back|put it back|never ?mind,? undo)[.!]*\s*$/i;

interface BookState {
  workId: string;
  title: string;
  status: ReadingStatus;
  addedAt: Date;
  review: { rating: number | null; body: string | null; isFavourite: boolean; rereadIntention: boolean } | null;
  shelfIds: string[];
  noteIds: string[];
}

export interface Snapshot {
  at: number;
  books: BookState[];
  libraryIds: string[];
  shelfIds: string[];
}

const TTL_MS = 30 * 60 * 1000;
const last = new Map<string, Snapshot>();

async function bookState(userId: string, workId: string): Promise<BookState | undefined> {
  const uw = await prisma.userWork.findUnique({
    where: { userId_workId: { userId, workId } },
    include: { work: { select: { title: true } }, shelves: { select: { shelfId: true } } },
  });
  if (!uw) return undefined;
  const [review, notes] = await Promise.all([
    prisma.review.findUnique({ where: { userId_workId: { userId, workId } } }),
    prisma.note.findMany({ where: { userId, workId }, select: { id: true } }),
  ]);
  return {
    workId,
    title: uw.work.title,
    status: uw.status as ReadingStatus,
    addedAt: uw.addedAt,
    review: review ? { rating: review.rating, body: review.body, isFavourite: review.isFavourite, rereadIntention: review.rereadIntention } : null,
    shelfIds: uw.shelves.map((s) => s.shelfId),
    noteIds: notes.map((n) => n.id),
  };
}

export async function snapshotBefore(userId: string, plan: IntentPlan): Promise<Snapshot | undefined> {
  const changes = plan.intents.filter((i) => ![BookIntent.LibraryQuestion, BookIntent.SearchLibrary, BookIntent.RecommendBook, 'AskQuestion', 'Help'].includes(i.type as BookIntent));
  if (changes.length === 0) return undefined;
  const library = await prisma.userWork.findMany({ where: { userId }, include: { work: { select: { title: true } } } });
  const owned = library.map((uw) => ({ title: uw.work.title, workId: uw.workId }));
  const workIds = new Set<string>();
  for (const i of changes) {
    for (const t of i.targets ?? []) {
      if (t.type !== IntentTargetType.Book) continue;
      const best = rankByTitle(t.name, owned)[0];
      if (best && best.score >= 80) workIds.add(best.item.workId);
    }
  }
  const books = (await Promise.all([...workIds].map((id) => bookState(userId, id)))).filter((b): b is BookState => Boolean(b));
  const shelves = await prisma.shelf.findMany({ where: { userId }, select: { id: true } });
  return { at: Date.now(), books, libraryIds: library.map((uw) => uw.workId), shelfIds: shelves.map((s) => s.id) };
}

export function rememberChange(userId: string, snapshot: Snapshot): void {
  last.set(userId, snapshot);
}

export function forgetChange(userId: string): void {
  last.delete(userId);
}

/** Everything a books plan changes is covered by the snapshot. */
export function hasUntrackedChanges(): boolean {
  return false;
}

export async function undoLastChange(userId: string): Promise<string> {
  const snap = last.get(userId);
  last.delete(userId);
  if (!snap || Date.now() - snap.at > TTL_MS) {
    return "There's nothing for me to undo. I can undo the last change I made, for half an hour after it.";
  }
  const done: string[] = [];

  for (const before of snap.books) {
    const now = await bookState(userId, before.workId);
    if (!now) {
      // Removed by that change: back into the library, as it was.
      await prisma.userWork.create({ data: { userId, workId: before.workId, status: before.status, addedAt: before.addedAt } });
      for (const shelfId of before.shelfIds) await assignWorkToShelf(userId, shelfId, { workId: before.workId }).catch(() => undefined);
      done.push(`put ${before.title} back in your library`);
      continue;
    }
    if (now.status !== before.status) {
      await updateWork(userId, before.workId, { status: before.status });
      done.push(`set ${before.title} back to ${STATUS_LABEL[before.status]}`);
    }
    const r1 = JSON.stringify(before.review);
    const r2 = JSON.stringify(now.review);
    if (r1 !== r2) {
      if (before.review) await upsertReview(userId, before.workId, before.review);
      else await deleteReview(userId, before.workId);
      done.push(before.review ? `restored your earlier rating and review of ${before.title}` : `removed the rating and review from ${before.title}`);
    }
    const newNotes = now.noteIds.filter((id) => !before.noteIds.includes(id));
    for (const id of newNotes) await deleteNote(userId, id);
    if (newNotes.length) done.push(`deleted the note${newNotes.length > 1 ? 's' : ''} I added to ${before.title}`);
    const added = now.shelfIds.filter((id) => !before.shelfIds.includes(id));
    const removed = before.shelfIds.filter((id) => !now.shelfIds.includes(id));
    for (const id of added) await removeWorkFromShelf(userId, id, before.workId).catch(() => undefined);
    for (const id of removed) await assignWorkToShelf(userId, id, { workId: before.workId }).catch(() => undefined);
    if (added.length || removed.length) done.push(`put ${before.title}'s shelves back as they were`);
  }

  // Books that change added: out again.
  const libraryNow = await prisma.userWork.findMany({ where: { userId }, include: { work: { select: { title: true } } } });
  for (const uw of libraryNow.filter((uw) => !snap.libraryIds.includes(uw.workId))) {
    await deleteWork(userId, uw.workId);
    done.push(`took ${uw.work.title} back out of your library`);
  }
  // Shelves it created, if still empty.
  const shelvesNow = await prisma.shelf.findMany({ where: { userId }, include: { works: { select: { shelfId: true } } } });
  for (const shelf of shelvesNow.filter((s) => !snap.shelfIds.includes(s.id) && s.works.length === 0)) {
    await deleteShelf(userId, shelf.id);
    done.push(`deleted the "${shelf.name}" shelf`);
  }

  if (done.length === 0) return 'That change is already undone; nothing needed putting back.';
  const sentence = listJoin(done);
  return `Undone: I ${sentence}.`;
}
