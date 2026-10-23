import { test, expect } from '@playwright/test';
import { axisLabelIndices, bucketLabel, compactNumber, formatMinutes, languageLabel, niceTicks } from './chart-format';

test.describe('niceTicks', () => {
  test('no data gives a single zero tick', () => {
    expect(niceTicks(0)).toEqual([0]);
  });

  test('rounds the top up to a clean step', () => {
    expect(niceTicks(47)).toEqual([0, 20, 40, 60]);
    expect(niceTicks(100)).toEqual([0, 50, 100]);
    expect(niceTicks(3)).toEqual([0, 1, 2, 3]);
  });

  test('never produces fractional ticks for whole-number data', () => {
    for (const max of [1, 2, 9, 13, 250, 1234]) {
      for (const tick of niceTicks(max)) expect(Number.isInteger(tick)).toBe(true);
    }
  });

  test('the top tick always covers the maximum', () => {
    for (const max of [1, 7, 47, 99, 101, 999, 4321]) {
      const ticks = niceTicks(max);
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(max);
    }
  });
});

test.describe('number and duration formatting', () => {
  test('compacts from 1,000 up', () => {
    expect(compactNumber(999)).toBe('999');
    expect(compactNumber(1000)).toBe('1K');
    expect(compactNumber(1500)).toBe('1.5K');
    expect(compactNumber(12_000)).toBe('12K');
  });

  test('minutes read as minutes, then hours and minutes', () => {
    expect(formatMinutes(0)).toBe('0 min');
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(120)).toBe('2h');
    expect(formatMinutes(125)).toBe('2h 5m');
  });
});

test.describe('bucket labels', () => {
  test('calendar-date buckets are not shifted by the runner time zone', () => {
    expect(bucketLabel('2026-10-01', 'daily', 'axis', 'en-US')).toBe('Oct 1');
    expect(bucketLabel('2026-10-01', 'monthly', 'full', 'en-US')).toBe('October 2026');
  });

  test('each range has its own wording', () => {
    expect(bucketLabel('2026-10-19', 'weekly', 'full', 'en-US')).toBe('Week of Oct 19, 2026');
    expect(bucketLabel('2026-01-01', 'yearly', 'axis', 'en-US')).toBe('2026');
    expect(bucketLabel('2024-06-01', 'all-time', 'full', 'en-US')).toBe('Since Jun 1, 2024');
  });

  test('about six axis labels, always including the latest bucket', () => {
    expect([...axisLabelIndices(30)].sort((a, b) => a - b)).toEqual([4, 9, 14, 19, 24, 29]);
    expect(axisLabelIndices(12).has(11)).toBe(true);
    expect(axisLabelIndices(3)).toEqual(new Set([0, 1, 2]));
    expect(axisLabelIndices(1)).toEqual(new Set([0]));
  });
});

test.describe('languageLabel', () => {
  test('turns ISO codes into names and passes other values through', () => {
    expect(languageLabel('en')).toBe('English');
    // R2-23: names pass through, capitalised, never lowercased by Intl.
    expect(languageLabel('English')).toBe('English');
    expect(languageLabel('english')).toBe('English');
    expect(languageLabel('Tamil')).toBe('Tamil');
    expect(languageLabel('ta')).toBe('Tamil');
    expect(languageLabel('Klingon dialect')).toBe('Klingon dialect');
  });
});
