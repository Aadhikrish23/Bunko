import { test, expect } from '@playwright/test';
import { paginateText, paginateChapterText, estimateCharsPerPage } from './paginate-text';

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

test.describe('paginateChapterText', () => {
  test('short text stays on a single page regardless of the two budgets', () => {
    expect(paginateChapterText('A short chapter.', 100, 500)).toEqual(['A short chapter.']);
  });

  test('packs the first page to a smaller budget than the rest, for the chapter heading', () => {
    const text = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen';
    const pages = paginateChapterText(text, 15, 40);
    // First page respects the smaller (heading-reserving) budget...
    expect(pages[0]!.length).toBeLessThanOrEqual(15);
    // ...while later pages use the full regular budget.
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.join(' ').split(' ')).toEqual(text.split(' '));
  });

  test('empty text still returns one (empty) page', () => {
    expect(paginateChapterText('   ', 10, 500)).toEqual(['']);
  });
});

test.describe('estimateCharsPerPage', () => {
  const opts = { lineHeightMultiplier: 1.5, marginFraction: 0.08 };

  test('a larger page box fits more characters', () => {
    const small = estimateCharsPerPage(300, 400, 1, opts);
    const large = estimateCharsPerPage(600, 800, 1, opts);
    expect(large).toBeGreaterThan(small);
  });

  test('a larger font scale fits fewer characters', () => {
    const normal = estimateCharsPerPage(400, 600, 1, opts);
    const zoomed = estimateCharsPerPage(400, 600, 1.5, opts);
    expect(zoomed).toBeLessThan(normal);
  });

  test('a taller line height fits fewer characters', () => {
    const tight = estimateCharsPerPage(400, 600, 1, { ...opts, lineHeightMultiplier: 1.2 });
    const loose = estimateCharsPerPage(400, 600, 1, { ...opts, lineHeightMultiplier: 2.0 });
    expect(loose).toBeLessThan(tight);
  });

  test('a wider margin fraction fits fewer characters', () => {
    const compact = estimateCharsPerPage(400, 600, 1, { ...opts, marginFraction: 0.06 });
    const wide = estimateCharsPerPage(400, 600, 1, { ...opts, marginFraction: 0.12 });
    expect(wide).toBeLessThan(compact);
  });

  test('reserving space for a chapter heading fits fewer characters', () => {
    const plain = estimateCharsPerPage(400, 600, 1, opts);
    const withHeading = estimateCharsPerPage(400, 600, 1, { ...opts, reservedTopPx: 56 });
    expect(withHeading).toBeLessThan(plain);
  });

  test('uses default options when none are passed', () => {
    expect(() => estimateCharsPerPage(400, 600, 1)).not.toThrow();
  });
});
