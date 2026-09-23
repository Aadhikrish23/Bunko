import { test, expect } from '@playwright/test';
import { paginateText, estimateCharsPerPage } from './paginate-text';

test.describe('paginateText', () => {
  test('short text stays on a single page', () => {
    expect(paginateText('A short chapter.', 500)).toEqual(['A short chapter.']);
  });

  test('splits at word boundaries, not mid-word', () => {
    const text = 'one two three four five six seven eight nine ten';
    const pages = paginateText(text, 12);
    for (const page of pages) {
      expect(page.startsWith(' ')).toBe(false);
      expect(page.endsWith(' ')).toBe(false);
    }
    // Rejoining every page (with single spaces) reproduces the original words.
    expect(pages.join(' ')).toBe(text);
  });

  test('every word from the source appears exactly once across all pages', () => {
    const text = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ');
    const pages = paginateText(text, 100);
    expect(pages.join(' ').split(' ')).toEqual(text.split(' '));
  });

  test('empty text still returns one (empty) page rather than nothing', () => {
    expect(paginateText('   ', 500)).toEqual(['']);
  });
});

test.describe('estimateCharsPerPage', () => {
  test('a larger page box fits more characters', () => {
    const small = estimateCharsPerPage(300, 400, 1);
    const large = estimateCharsPerPage(600, 800, 1);
    expect(large).toBeGreaterThan(small);
  });

  test('a larger font scale fits fewer characters', () => {
    const normal = estimateCharsPerPage(400, 600, 1);
    const zoomed = estimateCharsPerPage(400, 600, 1.5);
    expect(zoomed).toBeLessThan(normal);
  });
});
