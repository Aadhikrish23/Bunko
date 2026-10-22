import { test, expect } from '@playwright/test';
import type { Review } from '../../lib/api/types';
import { isEmptyDraft, sameDraft, toDraft } from './review-draft';

function mockReview(overrides: Partial<Review> = {}): Review {
  return {
    id: 'r1',
    workId: 'w1',
    rating: 4,
    body: 'Loved it',
    isFavourite: true,
    rereadIntention: false,
    metadata: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

test.describe('review-draft', () => {
  test('a missing review becomes an empty draft', () => {
    const draft = toDraft(null);
    expect(draft).toEqual({ rating: null, body: '', isFavourite: false, rereadIntention: false });
    expect(isEmptyDraft(draft)).toBe(true);
  });

  test('an existing review maps field-for-field, with a null body as an empty string', () => {
    expect(toDraft(mockReview({ body: null }))).toEqual({
      rating: 4,
      body: '',
      isFavourite: true,
      rereadIntention: false,
    });
  });

  test('whitespace-only body edits are not a real change', () => {
    const saved = toDraft(mockReview());
    expect(sameDraft(saved, { ...saved, body: '  Loved it  ' })).toBe(true);
    expect(sameDraft(saved, { ...saved, body: 'Loved it a lot' })).toBe(false);
  });

  test('any single field set means the draft is not empty (SRS §14: independent actions)', () => {
    const empty = toDraft(null);
    expect(isEmptyDraft({ ...empty, rating: 3 })).toBe(false);
    expect(isEmptyDraft({ ...empty, body: 'A thought' })).toBe(false);
    expect(isEmptyDraft({ ...empty, isFavourite: true })).toBe(false);
    expect(isEmptyDraft({ ...empty, rereadIntention: true })).toBe(false);
    expect(isEmptyDraft({ ...empty, body: '   ' })).toBe(true);
  });
});
