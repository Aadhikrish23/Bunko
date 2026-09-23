import { test, expect } from '@playwright/test';
import type { Work } from '../../lib/api/types';
import { sortWorksByOrder } from './shelf-order';

function mockWork(id: string, title: string): Work {
  return {
    id,
    title,
    authors: ['Test Author'],
    status: 'READING',
    editions: [],
    journeyId: null,
    genres: [],
    seriesName: null,
    shelfIds: [],
    coverImageUrl: null,
    description: null,
    seriesWorks: [],
  };
}

test.describe('shelf-order', () => {
  test('returns works in original order when savedOrder is empty', () => {
    const works = [mockWork('1', 'Book A'), mockWork('2', 'Book B'), mockWork('3', 'Book C')];
    const sorted = sortWorksByOrder(works, []);
    expect(sorted.map((w) => w.id)).toEqual(['1', '2', '3']);
  });

  test('sorts works according to savedOrder', () => {
    const works = [mockWork('1', 'Book A'), mockWork('2', 'Book B'), mockWork('3', 'Book C')];
    const savedOrder = ['3', '1', '2'];
    const sorted = sortWorksByOrder(works, savedOrder);
    expect(sorted.map((w) => w.id)).toEqual(['3', '1', '2']);
  });

  test('appends newly added works not in savedOrder to the end', () => {
    const works = [
      mockWork('1', 'Book A'),
      mockWork('2', 'Book B'),
      mockWork('3', 'Book C'),
      mockWork('4', 'New Book D'),
    ];
    const savedOrder = ['2', '1'];
    const sorted = sortWorksByOrder(works, savedOrder);
    expect(sorted.map((w) => w.id)).toEqual(['2', '1', '3', '4']);
  });
});
