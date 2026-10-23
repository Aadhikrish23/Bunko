import { test, expect } from '@playwright/test';
import { findPassage, pageForOffset, segmentFragment, splitParagraphs } from './flow-layout';

test.describe('splitParagraphs', () => {
  test('splits on blank lines and keeps offsets into the original text (R2-02)', () => {
    const text = 'First line\nstill first.\n\n  Second.\n \n\nThird.';
    const paragraphs = splitParagraphs(text);
    expect(paragraphs.map((p) => p.text)).toEqual(['First line\nstill first.', 'Second.', 'Third.']);
    for (const p of paragraphs) expect(text.slice(p.start, p.start + p.text.length)).toBe(p.text);
  });

  test('an empty chapter has no paragraphs', () => {
    expect(splitParagraphs('  \n\n ')).toEqual([]);
  });
});

test.describe('findPassage', () => {
  const chapter = 'Aldmere had one lantern.\n\nIt was enough (more or less) for the road.';

  test('finds a selection that crossed a paragraph break (R2-01)', () => {
    const found = findPassage(chapter, 'one lantern. It was');
    expect(found).not.toBeNull();
    expect(chapter.slice(found!.start, found!.end)).toBe('one lantern.\n\nIt was');
  });

  test('treats punctuation literally', () => {
    expect(findPassage(chapter, '(more or less)')).not.toBeNull();
    expect(findPassage(chapter, 'not in the book')).toBeNull();
  });
});

test.describe('segmentFragment', () => {
  const fragment = { text: 'It was enough for the road.', start: 100, end: 127, continued: false };

  test('cuts a fragment into plain and highlighted runs', () => {
    const runs = segmentFragment(fragment, [{ start: 107, end: 113, color: 'green', id: 'a' }]);
    expect(runs.map((r) => [r.text, r.mark?.id ?? null])).toEqual([
      ['It was ', null],
      ['enough', 'a'],
      [' for the road.', null],
    ]);
  });

  test('a highlight that began on the previous page starts this fragment', () => {
    const runs = segmentFragment(fragment, [{ start: 50, end: 106, color: 'yellow', id: 'b' }]);
    expect(runs[0]).toEqual({ text: 'It was', mark: expect.objectContaining({ id: 'b' }) });
  });
});

test('pageForOffset finds the page a reader was on after re-layout (R2-12)', () => {
  expect(pageForOffset([0, 900, 1800, 2700], 2000)).toBe(2);
  expect(pageForOffset([0, 900], 0)).toBe(0);
});
