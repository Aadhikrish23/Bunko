import { test, expect } from '@playwright/test';
import type { Work } from '../../lib/api/types';
import { groupWorksForShelf } from './group-works';

function mockWork(id: string, title: string, opts: { seriesName?: string | null; genres?: string[] } = {}): Work {
  return {
    id,
    title,
    authors: ['Test Author'],
    status: 'READING',
    editions: [],
    journeyId: null,
    genres: opts.genres ?? [],
    seriesName: opts.seriesName ?? null,
    shelfIds: [],
    coverImageUrl: null,
    description: null,
    seriesWorks: [],
  };
}

test.describe('groupWorksForShelf', () => {
  test('a shelf with no series/genre metadata collapses to a single ungrouped bucket', () => {
    const works = [mockWork('1', 'A'), mockWork('2', 'B')];
    const groups = groupWorksForShelf(works);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe('Books');
    expect(groups[0]!.works.map((w) => w.id)).toEqual(['1', '2']);
  });

  test('groups by series first, sorted alphabetically by series name', () => {
    const works = [
      mockWork('1', 'Zed One', { seriesName: 'Zeta Series' }),
      mockWork('2', 'Alpha One', { seriesName: 'Alpha Series' }),
      mockWork('3', 'Zed Two', { seriesName: 'Zeta Series' }),
      mockWork('4', 'Alpha Two', { seriesName: 'Alpha Series' }),
    ];
    const groups = groupWorksForShelf(works);
    expect(groups.map((g) => g.label)).toEqual(['Alpha Series', 'Zeta Series']);
  });

  test('books without a series fall back to genre grouping', () => {
    const works = [
      mockWork('1', 'A', { genres: ['Fantasy'] }),
      mockWork('2', 'B', { genres: ['Sci-Fi'] }),
      mockWork('3', 'C', { genres: ['Fantasy'] }),
      mockWork('4', 'D', { genres: ['Sci-Fi'] }),
    ];
    const groups = groupWorksForShelf(works);
    expect(groups.map((g) => g.label)).toEqual(['Fantasy', 'Sci-Fi']);
  });

  test('series groups come before genre groups, with ungrouped leftovers in their own row', () => {
    const works = [
      mockWork('1', 'A', { genres: ['Fantasy'] }),
      mockWork('2', 'B', { seriesName: 'A Series' }),
      mockWork('3', 'C'),
      mockWork('4', 'D', { genres: ['Fantasy'] }),
      mockWork('5', 'E', { seriesName: 'A Series' }),
    ];
    const groups = groupWorksForShelf(works);
    expect(groups.map((g) => g.label)).toEqual(['A Series', 'Fantasy', 'More Books']);
    expect(groups[2]!.works.map((w) => w.id)).toEqual(['3']);
  });

  test('a work with both a series and a genre is grouped by series, not genre', () => {
    const works = [
      mockWork('1', 'A', { seriesName: 'A Series', genres: ['Fantasy'] }),
      mockWork('2', 'B', { seriesName: 'A Series', genres: ['Fantasy'] }),
    ];
    const groups = groupWorksForShelf(works);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe('A Series');
  });

  test('a series or genre of one book shares the general row instead of a row of its own (R1-12)', () => {
    const works = [
      mockWork('1', 'Dune', { seriesName: 'Dune' }),
      mockWork('2', 'The Left Hand of Darkness', { seriesName: 'Hainish Cycle', genres: ['Science Fiction'] }),
      mockWork('3', 'Hyperion', { genres: ['Science Fiction'] }),
      mockWork('4', 'Circe', { genres: ['Mythology'] }),
    ];
    const groups = groupWorksForShelf(works);
    expect(groups.map((g) => [g.label, g.works.map((w) => w.title)])).toEqual([
      ['Science Fiction', ['The Left Hand of Darkness', 'Hyperion']],
      ['More Books', ['Dune', 'Circe']],
    ]);
  });

  test('empty shelf returns no groups', () => {
    expect(groupWorksForShelf([])).toEqual([]);
  });
});
