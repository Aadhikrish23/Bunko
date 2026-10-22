// Reading pace (SRS §19.3, T-056) — computed only "where enough reliable
// data exists". Below the threshold every pace field is null rather than
// a number built from one or two sessions.
//
// A session counts toward the sample only if its page progress is known
// and positive and it lasted at least a minute: unknown progress can't be
// measured, a sub-minute session is almost always an accidental open, and
// a 0-page EPUB session usually means reading stayed inside one chapter
// (EPUB progress is chapter-granular — see progress.ts), not that no
// reading happened.
export const MIN_PACE_SESSIONS = 3;
export const MIN_PACE_TOTAL_MINUTES = 30;
const MIN_SESSION_SECONDS = 60;

export interface PaceStats {
  pagesPerHour: number | null;
  pagesPerSession: number | null;
  sampleSessions: number;
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

export function computePace(samples: { pages: number | null; durationSeconds: number | null }[]): PaceStats {
  const usable = samples.filter(
    (sample): sample is { pages: number; durationSeconds: number } =>
      sample.pages !== null && sample.pages > 0 && (sample.durationSeconds ?? 0) >= MIN_SESSION_SECONDS,
  );
  const totalPages = usable.reduce((sum, sample) => sum + sample.pages, 0);
  const totalSeconds = usable.reduce((sum, sample) => sum + sample.durationSeconds, 0);

  if (usable.length < MIN_PACE_SESSIONS || totalSeconds < MIN_PACE_TOTAL_MINUTES * 60) {
    return { pagesPerHour: null, pagesPerSession: null, sampleSessions: usable.length };
  }

  return {
    pagesPerHour: roundToTenth(totalPages / (totalSeconds / 3600)),
    pagesPerSession: roundToTenth(totalPages / usable.length),
    sampleSessions: usable.length,
  };
}
