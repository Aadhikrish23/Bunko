// Bunko's four reading statuses (DATA_MODEL.md, ReadingStatus) and the words readers use for
// them. There is no "paused": the reader keeps it as Reading, and the assistant says so.

export type ReadingStatus = 'WANT_TO_READ' | 'READING' | 'FINISHED' | 'DID_NOT_FINISH';

export const STATUS_LABEL: Record<ReadingStatus, string> = {
  WANT_TO_READ: 'Want to Read',
  READING: 'Reading',
  FINISHED: 'Finished',
  DID_NOT_FINISH: 'Did Not Finish',
};

/** "TBR", "dnf'd", "finished", "currently reading"... -> a status, or undefined. */
export function toStatus(raw: unknown): ReadingStatus | undefined {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ');
  if (!s) return undefined;
  if (/^(want to read|wanttoread)$/.test(s.replace(/\s+/g, ' '))) return 'WANT_TO_READ';
  if (/^(did not finish|didnotfinish)$/.test(s)) return 'DID_NOT_FINISH';
  // "Did not finish" before "finish"; "gave up" before anything that says "up".
  if (/\b(dnf|dnfd|dnf'd|did ?n[o']?t finish|didn'?t finish|gave up|give up|giving up|abandon\w*|drop\w*|quit\w*|stopped)\b/.test(s)) {
    return 'DID_NOT_FINISH';
  }
  if (/\b(paus\w*|on hold|hold)\b/.test(s)) return undefined;
  if (/\b(tbr|to be read|to read|want\w*|later|backlog|wish ?list|plan\w*|someday|queue\w*)\b/.test(s)) return 'WANT_TO_READ';
  if (/\b(finish\w*|done|complete\w*|read it|have read|already read|read)\b/.test(s)) return 'FINISHED';
  if (/\b(reading|start\w*|current\w*|in progress|began|begin\w*|picked up|resum\w*|reread\w*|re read\w*)\b/.test(s)) return 'READING';
  return undefined;
}

/** "paused" / "on hold": a status Bunko doesn't have. */
export function isPausedWord(raw: unknown): boolean {
  return /\b(paus\w*|on hold)\b/i.test(String(raw ?? ''));
}
