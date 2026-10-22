import { test, expect } from '@playwright/test';
import type { Chapter, ChapterTranslation } from '../../lib/api/types';
import {
  applyTranslations,
  chapterTranslationState,
  isRtl,
  progressLabel,
  translationsKey,
  usableTranslations,
} from './translation-view';

const chapters: Chapter[] = [
  { structuralId: 'c1', label: 'One', order: 0, pageNumber: null, text: 'Hello.' },
  { structuralId: 'c2', label: 'Two', order: 1, pageNumber: null, text: 'Goodbye.' },
];

function translation(overrides: Partial<ChapterTranslation>): ChapterTranslation {
  return {
    id: 't1',
    structuralId: 'c1',
    targetLanguage: 'fr',
    status: 'READY',
    segmentsDone: 1,
    segmentsTotal: 1,
    text: 'Bonjour.',
    error: null,
    stale: false,
    model: 'claude-opus-5-5',
    updatedAt: '2026-10-22T10:00:00.000Z',
    generated: true,
    ...overrides,
  };
}

test.describe('applyTranslations', () => {
  test('swaps in finished translations and marks them', () => {
    const shown = applyTranslations(chapters, usableTranslations([translation({})]), true);
    expect(shown.map((c) => [c.text, c.translated])).toEqual([
      ['Bonjour.', true],
      ['Goodbye.', false],
    ]);
  });

  test('shows the original when switched off, and never a pending, failed, or stale one', () => {
    expect(applyTranslations(chapters, usableTranslations([translation({})]), false)[0]!.text).toBe('Hello.');
    const unusable = [
      translation({ status: 'PENDING', text: null }),
      translation({ id: 't2', structuralId: 'c2', status: 'FAILED', text: null }),
      translation({ id: 't3', stale: true }),
    ];
    expect(usableTranslations(unusable)).toEqual([]);
  });
});

test('translationsKey only changes when a usable translation does', () => {
  const ready = [translation({})];
  expect(translationsKey(ready)).toBe(translationsKey([translation({})]));
  expect(translationsKey(ready)).not.toBe(translationsKey([translation({ updatedAt: '2026-10-22T11:00:00.000Z' })]));
});

test.describe('chapterTranslationState', () => {
  test('reports each state for the current chapter only', () => {
    expect(chapterTranslationState(undefined, 'c1')).toEqual({ kind: 'none' });
    expect(chapterTranslationState([translation({})], 'c2')).toEqual({ kind: 'none' });
    expect(chapterTranslationState([translation({ status: 'PENDING', segmentsDone: 2, segmentsTotal: 5 })], 'c1')).toEqual({
      kind: 'pending',
      done: 2,
      total: 5,
    });
    expect(chapterTranslationState([translation({ status: 'FAILED', error: 'Busy' })], 'c1')).toEqual({
      kind: 'failed',
      message: 'Busy',
    });
    expect(chapterTranslationState([translation({ stale: true })], 'c1')).toEqual({ kind: 'stale' });
    expect(chapterTranslationState([translation({})], 'c1')).toEqual({ kind: 'ready' });
  });
});

test('progressLabel counts the part being worked on', () => {
  expect(progressLabel({ done: 0, total: 1 })).toBe('Translating…');
  expect(progressLabel({ done: 2, total: 5 })).toBe('Translating… part 3 of 5');
  expect(progressLabel({ done: 5, total: 5 })).toBe('Translating… part 5 of 5');
});

test('isRtl follows the language list', () => {
  const languages = [{ code: 'ar', name: 'Arabic', rtl: true }, { code: 'fr', name: 'French' }];
  expect(isRtl(languages, 'ar')).toBe(true);
  expect(isRtl(languages, 'fr')).toBe(false);
  expect(isRtl(languages, null)).toBe(false);
});
