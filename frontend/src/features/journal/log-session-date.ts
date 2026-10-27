/** `YYYY-MM-DD` for a date in the local time zone. */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * When to say a logged session ended. The journal files an entry by its
 * *start* time (end minus its length), so using the live clock for "today"
 * can roll the start before local midnight near the start of a day — the
 * entry then shows up a day earlier than the one the reader picked (R5-03).
 * Noon on the chosen day, used for every past date, also covers that case.
 */
export function chooseEndedAt(dateKey: string, minutes: number, now: Date): Date {
  const startOfChosenDay = new Date(`${dateKey}T00:00:00`);
  const fitsToday = dateKey === toDateKey(now) && now.getTime() - minutes * 60_000 >= startOfChosenDay.getTime();
  return fitsToday ? now : new Date(`${dateKey}T12:00:00`);
}
