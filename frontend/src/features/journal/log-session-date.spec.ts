import { test, expect } from '@playwright/test';
import { chooseEndedAt, toDateKey } from './log-session-date';

test.describe('chooseEndedAt (R5-03)', () => {
  test('uses the live clock when the session fits entirely within today', () => {
    const now = new Date('2026-10-28T14:00:00');
    const result = chooseEndedAt(toDateKey(now), 45, now);
    expect(result.getTime()).toBe(now.getTime());
  });

  test('still uses the live clock for today even when the session would start before local midnight', () => {
    // 00:10 local, logging a 45-minute session: falling back to noon (as a
    // past date would) is in the future at this hour and the server would
    // reject its own form's defaults ("ends in the future") — so "today"
    // always gets the live clock, even though the computed start (23:25
    // the day before) means this entry's start technically lands on the
    // previous calendar day.
    const now = new Date('2026-10-28T00:10:00');
    const result = chooseEndedAt('2026-10-28', 45, now);
    expect(result.getTime()).toBe(now.getTime());
    expect(result.getTime()).toBeLessThanOrEqual(now.getTime());
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
