import { Heart, Repeat, Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { useDeleteReview, useReview, useUpsertReview } from '../../lib/api/reviews';
import { errorMessage } from '../../lib/error-message';
import { isEmptyDraft, sameDraft, toDraft, type ReviewDraft } from './review-draft';

const STARS = [1, 2, 3, 4, 5] as const;

// SRS §14 — rate, review, favourite, and reread intention are independent
// (any one can be set without the others), and there's one review per
// book, so this is an edit-in-place form rather than a list.
export function ReviewPanel({ workId }: { workId: string }) {
  const review = useReview(workId);
  const upsert = useUpsertReview(workId);
  const remove = useDeleteReview(workId);
  const [draft, setDraft] = useState<ReviewDraft>(() => toDraft(null));
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (review.data !== undefined) setDraft(toDraft(review.data));
  }, [review.data]);

  if (review.isLoading) {
    return <p className="text-sm text-paper-600">Loading your review…</p>;
  }
  if (review.isError) {
    return <ErrorBanner message={errorMessage(review.error, 'Could not load your review.')} />;
  }

  const saved = toDraft(review.data);
  const isDirty = !sameDraft(draft, saved);
  const shownRating = hoverRating ?? draft.rating ?? 0;

  function update(patch: Partial<ReviewDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setJustSaved(false);
  }

  function handleSave() {
    upsert.mutate(
      {
        rating: draft.rating,
        body: draft.body.trim() || null,
        isFavourite: draft.isFavourite,
        rereadIntention: draft.rereadIntention,
      },
      { onSuccess: () => setJustSaved(true) },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {upsert.isError && <ErrorBanner message={errorMessage(upsert.error, 'Could not save your review.')} />}

      <fieldset>
        <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-paper-700">Your rating</legend>
        <div className="flex items-center" onMouseLeave={() => setHoverRating(null)}>
          {STARS.map((value) => (
            <label key={value} className="cursor-pointer p-2.5" onMouseEnter={() => setHoverRating(value)}>
              <input
                type="radio"
                name={`rating-${workId}`}
                value={value}
                checked={draft.rating === value}
                onChange={() => update({ rating: value })}
                className="peer sr-only"
              />
              <Star
                aria-hidden="true"
                className={`h-6 w-6 rounded-sm transition-colors peer-focus-visible:focus-ring ${
                  shownRating >= value ? 'fill-ember-500 text-ember-500' : 'text-paper-500'
                }`}
              />
              <span className="sr-only">
                {value} {value === 1 ? 'star' : 'stars'}
              </span>
            </label>
          ))}
          {draft.rating !== null && (
            <button
              type="button"
              onClick={() => update({ rating: null })}
              className="focus-visible:focus-ring ml-1 min-h-[44px] rounded-md px-2 text-xs text-paper-700 hover:text-paper-900"
            >
              Clear rating
            </button>
          )}
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={draft.isFavourite}
          onClick={() => update({ isFavourite: !draft.isFavourite })}
          className={`focus-visible:focus-ring inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors ${
            draft.isFavourite
              ? 'border-ember-500 bg-ember-500/10 text-ember-600'
              : 'border-paper-300 bg-paper-50 text-paper-700 hover:border-ember-400'
          }`}
        >
          <Heart aria-hidden="true" className={`h-4 w-4 ${draft.isFavourite ? 'fill-ember-500' : ''}`} />
          Favourite
        </button>
        <button
          type="button"
          aria-pressed={draft.rereadIntention}
          onClick={() => update({ rereadIntention: !draft.rereadIntention })}
          className={`focus-visible:focus-ring inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors ${
            draft.rereadIntention
              ? 'border-moss-500 bg-moss-100 text-moss-700'
              : 'border-paper-300 bg-paper-50 text-paper-700 hover:border-moss-300'
          }`}
        >
          <Repeat aria-hidden="true" className="h-4 w-4" />
          Want to reread
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`review-body-${workId}`} className="text-xs font-medium uppercase tracking-wide text-paper-700">
          Your review
        </label>
        <textarea
          id={`review-body-${workId}`}
          value={draft.body}
          onChange={(e) => update({ body: e.target.value })}
          placeholder="What did you make of it?"
          rows={4}
          maxLength={10_000}
          className="w-full rounded-md border border-paper-300 bg-paper-50 p-2.5 text-sm text-paper-900 focus:border-moss-600 focus:outline-none"
        />
        <p className="text-xs text-paper-600">Private: only you can see your ratings, reviews and notes, so spoil away.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={handleSave} isLoading={upsert.isPending} disabled={!isDirty || isEmptyDraft(draft)}>
          {review.data ? 'Save changes' : 'Save review'}
        </Button>
        {review.data && (
          <Button type="button" variant="ghost" onClick={() => setConfirmDelete(true)}>
            Remove review
          </Button>
        )}
        {justSaved && !isDirty && (
          <span role="status" className="text-sm text-moss-700">
            Saved.
          </span>
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Remove your review?"
          message="Your rating, review text, and favourite/reread marks for this book will be deleted. This can't be undone."
          confirmLabel="Remove"
          isConfirming={remove.isPending}
          onConfirm={() =>
            remove.mutate(undefined, {
              onSuccess: () => {
                setConfirmDelete(false);
                setJustSaved(false);
              },
            })
          }
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
