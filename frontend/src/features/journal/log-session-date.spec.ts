import { test, expect } from '@playwright/test';
import { chooseEndedAt, toDateKey } from './log-session-date';

test.describe('chooseEndedAt (R5-03)', () => {
  test('uses the live clock when the session fits entirely within today', () => {
    const now = new Date('2026-10-28T14:00:00');
    const result = chooseEndedAt(toDateKey(now), 45, now);
    expect(result.getTime()).toBe(now.getTime());
  });

  test('falls back to noon on the chosen day when the session would start before local midnight', () => {
    // 00:10 local, logging a 45-minute session: subtracting the duration from "now"
    // would land at 23:25 the day before, which the journal would then show instead
    // of the day actually picked.
    const now = new Date('2026-10-28T00:10:00');
    const result = chooseEndedAt('2026-10-28', 45, now);
    expect(toDateKey(result)).toBe('2026-10-28');
    expect(result.getHours()).toBe(12);
  });

  test('a past date always anchors to noon, regardless of duration', () => {
    const now = new Date('2026-10-28T14:00:00');
    const result = chooseEndedAt('2026-10-20', 600, now);
    expect(toDateKey(result)).toBe('2026-10-20');
    expect(result.getHours()).toBe(12);
  });

  test('a session that just barely fits since local midnight still uses the live clock', () => {
    const now = new Date('2026-10-28T00:50:00');
    const result = chooseEndedAt('2026-10-28', 45, now);
    expect(result.getTime()).toBe(now.getTime());
  });
});
