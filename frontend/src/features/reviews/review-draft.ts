import type { Review } from '../../lib/api/types';

export interface ReviewDraft {
  rating: number | null;
  body: string;
  isFavourite: boolean;
  rereadIntention: boolean;
}

export function toDraft(review: Review | null | undefined): ReviewDraft {
  return {
    rating: review?.rating ?? null,
    body: review?.body ?? '',
    isFavourite: review?.isFavourite ?? false,
    rereadIntention: review?.rereadIntention ?? false,
  };
}

// Whitespace-only edits to the body don't count as a change worth saving.
export function sameDraft(a: ReviewDraft, b: ReviewDraft): boolean {
  return (
    a.rating === b.rating &&
    a.body.trim() === b.body.trim() &&
    a.isFavourite === b.isFavourite &&
    a.rereadIntention === b.rereadIntention
  );
}

export function isEmptyDraft(draft: ReviewDraft): boolean {
  return draft.rating === null && !draft.body.trim() && !draft.isFavourite && !draft.rereadIntention;
}
