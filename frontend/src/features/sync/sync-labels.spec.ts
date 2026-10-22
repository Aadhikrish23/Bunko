import { test, expect } from '@playwright/test';
import { deviceLabel } from '../../lib/device';
import { describePosition } from './conflict-format';

test.describe('deviceLabel', () => {
  test('names common browser/OS pairs', () => {
    expect(
      deviceLabel(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
      ),
    ).toBe('Chrome on Windows');
    expect(
      deviceLabel(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0',
      ),
    ).toBe('Edge on Windows');
    expect(
      deviceLabel(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('Safari on iOS');
    expect(deviceLabel('Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0')).toBe('Firefox on Linux');
  });

  test('falls back gracefully on unknown agents', () => {
    expect(deviceLabel('SomethingElse/1.0')).toBe('This browser');
  });
});

test.describe('describePosition', () => {
  test('prefers the chapter, then the page, then the raw id', () => {
    expect(describePosition({ chapterLabel: 'Chapter 9', pageNumber: 120, structuralId: 'ch9' })).toBe('Chapter 9');
    expect(describePosition({ chapterLabel: null, pageNumber: 120, structuralId: '120' })).toBe('Page 120');
    expect(describePosition({ chapterLabel: null, pageNumber: null, structuralId: 'idref7' })).toBe('idref7');
    expect(describePosition({ chapterLabel: null, pageNumber: null, structuralId: null })).toBe('An unknown position');
  });
});
