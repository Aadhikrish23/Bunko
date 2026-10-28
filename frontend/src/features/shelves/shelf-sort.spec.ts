import { test, expect } from '@playwright/test';
import type { Work } from '../../lib/api/types';
import { sortWorksForOption } from './shelf-sort';

function mockWork(overrides: Partial<Work> & { id: string }): Work {
  return {
    title: 'Untitled',
    authors: ['Test Author'],
    status: 'READING',
    finishedAt: null,
    editions: [],
    journeyId: null,
    genres: [],
    seriesName: null,
    shelfIds: [],
    coverImageUrl: null,
    spineImageUrl: null,
    description: null,
    seriesWorks: [],
    addedAt: '2026-01-01T00:00:00.000Z',
    rating: null,
    ...overrides,
  };
}

test.describe('sortWorksForOption', () => {
  test('title sorts alphabetically', () => {
    const works = [mockWork({ id: 'b', title: 'Six of Crows' }), mockWork({ id: 'a', title: 'A Study in Scarlet' })];
    expect(sortWorksForOption(works, 'title').map((w) => w.id)).toEqual(['a', 'b']);
  });

  test('author sorts by the first listed author', () => {
    const works = [mockWork({ id: 'b', authors: ['Bardugo'] }), mockWork({ id: 'a', authors: ['Austen'] })];
    expect(sortWorksForOption(works, 'author').map((w) => w.id)).toEqual(['a', 'b']);
  });

  test('addedAt sorts newest first', () => {
    const works = [
      mockWork({ id: 'old', addedAt: '2025-01-01T00:00:00.000Z' }),
      mockWork({ id: 'new', addedAt: '2026-01-01T00:00:00.000Z' }),
    ];
    expect(sortWorksForOption(works, 'addedAt').map((w) => w.id)).toEqual(['new', 'old']);
  });

  test('status sorts Reading, then Want to Read, then Finished, then Did Not Finish', () => {
    const works = [
      mockWork({ id: 'finished', status: 'FINISHED' }),
      mockWork({ id: 'dnf', status: 'DID_NOT_FINISH' }),
      mockWork({ id: 'reading', status: 'READING' }),
      mockWork({ id: 'want', status: 'WANT_TO_READ' }),
    ];
    expect(sortWorksForOption(works, 'status').map((w) => w.id)).toEqual(['reading', 'want', 'finished', 'dnf']);
  });

  test('rating sorts highest first, with unrated books last', () => {
    const works = [
      mockWork({ id: 'unrated', rating: null }),
      mockWork({ id: 'three', rating: 3 }),
      mockWork({ id: 'five', rating: 5 }),
    ];
    expect(sortWorksForOption(works, 'rating').map((w) => w.id)).toEqual(['five', 'three', 'unrated']);
  });
});
