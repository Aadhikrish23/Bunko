import { test, expect } from '@playwright/test';
import { joinSegments, segmentText } from '../src/modules/ai/segment-text';

// Pure (T-090): no server or database needed.
test.describe('segmentText', () => {
  test('a short chapter is one segment', () => {
    expect(segmentText('  One paragraph.\n\nTwo.  ', 100)).toEqual([{ text: 'One paragraph.\n\nTwo.', separatorAfter: '' }]);
  });

  test('cuts at paragraph breaks before anything else', () => {
    const para = 'Sentence one. Sentence two.'; // 27 chars
    const text = [para, para, para, para].join('\n\n');
    const segments = segmentText(text, 60);
    expect(segments.map((s) => s.text)).toEqual([`${para}\n\n${para}`, `${para}\n\n${para}`]);
    expect(segments[0]!.separatorAfter).toBe('\n\n');
  });

  test('falls back to line breaks, then sentence ends', () => {
    expect(segmentText('aaaa aaaa aaaa\nbbbb bbbb bbbb', 20).map((s) => s.separatorAfter)).toEqual(['\n', '']);
    const sentences = segmentText('First sentence here. Second sentence here.', 30);
    expect(sentences.map((s) => s.text)).toEqual(['First sentence here.', 'Second sentence here.']);
    expect(sentences[0]!.separatorAfter).toBe(' ');
  });

  test('cuts after CJK sentence ends without inventing a space', () => {
    const segments = segmentText('一二三四五六。七八九十一二。', 10);
    expect(segments.map((s) => s.text)).toEqual(['一二三四五六。', '七八九十一二。']);
    expect(segments[0]!.separatorAfter).toBe('');
  });

  test('every segment respects the target and no text is lost', () => {
    const words = Array.from({ length: 3000 }, (_, i) => `word${i}${i % 17 === 0 ? '.' : ''}`);
    const text = words.join(' ');
    const segments = segmentText(text, 500);
    expect(segments.every((s) => s.text.length <= 500)).toBe(true);
    expect(joinSegments(segments.map((s) => s.text), segments)).toBe(text);
  });

  test('a run with no break at all is hard-cut without splitting a surrogate pair', () => {
    const text = '😀'.repeat(10); // 20 UTF-16 units
    const segments = segmentText(text, 7);
    expect(segments.every((s) => !/[\uD800-\uDBFF]$/.test(s.text))).toBe(true);
    expect(segments.map((s) => s.text).join('')).toBe(text);
  });
});

test.describe('joinSegments', () => {
  test('restores the paragraph structure around translated pieces', () => {
    const segments = [
      { text: 'a', separatorAfter: '\n\n' },
      { text: 'b', separatorAfter: '\n' },
      { text: 'c', separatorAfter: '' },
    ];
    expect(joinSegments([' A ', 'B', 'C\n'], segments)).toBe('A\n\nB\nC');
  });
});
