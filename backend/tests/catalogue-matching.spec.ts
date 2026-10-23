import { test, expect } from '@playwright/test';
import { pickMatchingCover } from '../src/modules/library/library.service';
import { rankByTitleMatch } from '../src/modules/metadata/metadata.service';

// R1-02 / R1-10: covers only from the same book, and the closest titles first. Pure.

const candidate = (title: string, authors: string[], cover = `https://covers.example/${encodeURIComponent(title)}.jpg`) => ({
  title,
  authors,
  coverImageUrl: cover,
});

test.describe('pickMatchingCover', () => {
  test('takes a cover only from the same title and, when known, the same author', () => {
    const results = [
      candidate('Their Eyes Were Watching God', ['Zora Neale Hurston']),
      candidate('The Left Hand of Darkness: 50th Anniversary', ['Ursula K. Le Guin']),
    ];
    expect(pickMatchingCover('The Left Hand of Darkness', ['Ursula K. Le Guin'], results)).toContain('Left%20Hand');
  });

  test('a book nobody else has gets no cover rather than a stranger\'s', () => {
    const results = [candidate('Zines of the 90s', ['Some Author']), candidate('My Friend', ['Another'])];
    expect(pickMatchingCover("my friend's zine vol 2", [], results)).toBeNull();
  });

  test('same title by a different author is not this book', () => {
    expect(pickMatchingCover('Circe', ['Madeline Miller'], [candidate('Circe', ['Someone Else'])])).toBeNull();
  });
});

test.describe('rankByTitleMatch', () => {
  test('the exact title rises above unrelated popular results', () => {
    const ranked = rankByTitleMatch('tomorrow and tomorrow and tomorrow', [
      { title: 'Lessons from the Bible' },
      { title: 'Macbeth' },
      { title: 'Tomorrow, and Tomorrow, and Tomorrow' },
    ]);
    expect(ranked[0]!.title).toBe('Tomorrow, and Tomorrow, and Tomorrow');
  });

  test('keeps the provider order among equally good matches', () => {
    const ranked = rankByTitleMatch('piranesi', [{ title: 'Piranesi', id: 1 }, { title: 'Piranesi', id: 2 }] as never[]);
    expect(ranked.map((r: { id: number }) => r.id)).toEqual([1, 2]);
  });
});
