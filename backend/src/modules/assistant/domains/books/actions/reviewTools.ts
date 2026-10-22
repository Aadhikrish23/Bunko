import { BaseTool } from '../../../sdk/BaseTool';
import type { AIToolContext } from '../../../sdk/AIToolContext';
import type { AIToolResult } from '../../../sdk/AIToolResult';
import { prisma } from '../../../../../config/prisma';
import { deleteReview, upsertReview } from '../../../../reviews/reviews.service';
import { createNote } from '../../../../notes/notes.service';
import { ownBook, type BookResult } from './libraryTools';

/** Bunko ratings are whole stars, 1-5 (SRS §14). "9/10" or "8 out of 10" becomes stars. */
export function toStars(raw: unknown, scale?: number): number | undefined {
  const value = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(',', '.'));
  if (!Number.isFinite(value)) return undefined;
  const outOf = scale ?? (value > 5 ? 10 : 5);
  const stars = outOf === 5 ? value : (value / outOf) * 5;
  const rounded = Math.round(stars);
  return Math.abs(stars - rounded) < 1e-9 && rounded >= 1 && rounded <= 5 ? rounded : undefined;
}

export class CreateReviewTool extends BaseTool<{ bookId: string; rating?: number; reviewText?: string; scale?: number }, BookResult> {
  readonly category = 'review';
  readonly name = 'create_review';
  readonly description = 'Rates a book (1-5 stars) and/or saves review text, keeping whatever part was not given.';

  async execute(
    input: { bookId: string; rating?: number; reviewText?: string; scale?: number },
    context: AIToolContext,
  ): Promise<AIToolResult<BookResult>> {
    const own = await ownBook(context.userId, input.bookId);
    if (!own) return this.failure("That book isn't in your library.");
    const title = own.work.title;
    const text = typeof input.reviewText === 'string' && input.reviewText.trim() ? input.reviewText.trim() : undefined;
    const hasRating = input.rating !== undefined && input.rating !== null && String(input.rating) !== '';
    const stars = hasRating ? toStars(input.rating, input.scale) : undefined;
    if (hasRating && stars === undefined) {
      // "4.5" or "9/10": offer the two whole-star ratings either side.
      const value = Number(input.rating);
      const asStars = Number.isFinite(value) ? (value > 5 || input.scale === 10 ? value / 2 : value) : 3;
      const low = Math.min(5, Math.max(1, Math.floor(asStars)));
      const high = Math.min(5, Math.max(1, Math.ceil(asStars)));
      const choice = low === high ? `${low} stars` : `${low} or ${high} stars`;
      return this.failure(`Ratings in Bunko are whole stars from 1 to 5, so I didn't rate ${title}. Would you like ${choice}?`);
    }
    if (stars === undefined && !text) return this.failure(`What would you like to rate ${title}, from 1 to 5 stars?`);

    const before = await prisma.review.findUnique({ where: { userId_workId: { userId: context.userId, workId: own.workId } } });
    // Only the parts the reader gave change; an existing rating or review text is kept.
    await upsertReview(context.userId, own.workId, {
      rating: stars ?? before?.rating ?? null,
      body: text ?? before?.body ?? null,
      isFavourite: before?.isFavourite ?? false,
      rereadIntention: before?.rereadIntention ?? false,
    });
    const parts = [
      stars !== undefined ? `rated ${title} ${stars} star${stars === 1 ? '' : 's'}` : undefined,
      text ? (stars !== undefined ? 'saved your review' : `saved your review of ${title}`) : undefined,
    ].filter(Boolean);
    return this.success({ title, workId: own.workId }, `I've ${parts.join(' and ')}.`, {
      previousRating: before?.rating ?? null,
      previousBody: before?.body ?? null,
      hadReview: Boolean(before),
    });
  }
}

export class DeleteReviewTool extends BaseTool<{ bookId: string }, BookResult> {
  readonly category = 'review';
  readonly name = 'delete_review';
  readonly description = "Deletes the reader's rating and review of a book.";

  async execute(input: { bookId: string }, context: AIToolContext): Promise<AIToolResult<BookResult>> {
    const own = await ownBook(context.userId, input.bookId);
    if (!own) return this.failure("That book isn't in your library.");
    const existing = await prisma.review.findUnique({ where: { userId_workId: { userId: context.userId, workId: own.workId } } });
    if (!existing) {
      return this.success({ title: own.work.title, workId: own.workId }, `You haven't rated or reviewed ${own.work.title}, so there was nothing to delete.`, {
        nothingToDelete: true,
      });
    }
    await deleteReview(context.userId, own.workId);
    return this.success({ title: own.work.title, workId: own.workId }, `I've deleted your rating and review of ${own.work.title}.`, {
      deleted: { rating: existing.rating, body: existing.body, isFavourite: existing.isFavourite, rereadIntention: existing.rereadIntention },
    });
  }
}

export class AddNoteTool extends BaseTool<{ bookId: string; content: string }, BookResult & { noteId: string }> {
  readonly category = 'notes';
  readonly name = 'add_note';
  readonly description = 'Saves a note about a whole book.';

  async execute(input: { bookId: string; content: string }, context: AIToolContext): Promise<AIToolResult<BookResult & { noteId: string }>> {
    const own = await ownBook(context.userId, input.bookId);
    if (!own) return this.failure("That book isn't in your library.");
    const body = (input.content || '').trim();
    if (!body) return this.failure(`What should the note on ${own.work.title} say?`);
    const note = await createNote(context.userId, own.workId, { scope: 'BOOK', body: body.slice(0, 10_000) });
    return this.success({ title: own.work.title, workId: own.workId, noteId: note.id }, `I've added a note to ${own.work.title}: "${body}"`);
  }
}
