/** `YYYY-MM-DD` for a date in the local time zone. */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * When to say a logged session ended. The journal files an entry by its
 * *start* time (end minus its length), so using the live clock for a past
 * date can roll the start before local midnight — the entry then shows up
 * a day earlier than the one the reader picked (R5-03). Noon on the chosen
 * day avoids that for any day that *isn't* today.
 *
 * "Today" always uses the live clock instead, even right after local
 * midnight where a short session's start would land before midnight too:
 * noon hasn't happened yet that early, so using it here would place
 * endedAt in the future and the server would reject its own form's
 * default values ("a logged session can't end in the future") — worse
 * than the rare, honest case of a midnight-spanning session's start
 * showing under the previous day.
 */
export function chooseEndedAt(dateKey: string, minutes: number, now: Date): Date {
  if (dateKey === toDateKey(now)) return now;
  return new Date(`${dateKey}T12:00:00`);
}
