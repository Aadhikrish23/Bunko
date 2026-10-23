import type { Work } from '../../lib/api/types';

export interface WorkGroup {
  label: string;
  works: Work[];
}

/** A row needs at least two books: a "series" or genre of one is a lonely book on a tall shelf. */
const MIN_ROW = 2;

// Arranges a shelf's books the way a reader would organize a physical
// bookcase: series stay together first, then by genre, with everything
// else sharing a general row — rather than one long undifferentiated row,
// or a row per book.
export function groupWorksForShelf(works: Work[]): WorkGroup[] {
  const bySeriesName = new Map<string, Work[]>();
  for (const work of works) {
    if (!work.seriesName) continue;
    const group = bySeriesName.get(work.seriesName) ?? [];
    group.push(work);
    bySeriesName.set(work.seriesName, group);
  }
  const seriesRows = [...bySeriesName.entries()].filter(([, group]) => group.length >= MIN_ROW);
  const inSeriesRow = new Set(seriesRows.flatMap(([, group]) => group));

  const byGenre = new Map<string, Work[]>();
  for (const work of works) {
    if (inSeriesRow.has(work) || !work.genres[0]) continue;
    const group = byGenre.get(work.genres[0]) ?? [];
    group.push(work);
    byGenre.set(work.genres[0], group);
  }
  const genreRows = [...byGenre.entries()].filter(([, group]) => group.length >= MIN_ROW);
  const inGenreRow = new Set(genreRows.flatMap(([, group]) => group));

  const byLabel = ([a]: [string, Work[]], [b]: [string, Work[]]) => a.localeCompare(b);
  const groups: WorkGroup[] = [...seriesRows.sort(byLabel), ...genreRows.sort(byLabel)].map(([label, group]) => ({
    label,
    works: group,
  }));

  const ungrouped = works.filter((work) => !inSeriesRow.has(work) && !inGenreRow.has(work));
  if (ungrouped.length > 0) {
    // "More Books" once there's already a series/genre row above it;
    // otherwise this is the only row, so a generic "Books" label reads
    // better than repeating a section heading above it.
    groups.push({ label: groups.length > 0 ? 'More Books' : 'Books', works: ungrouped });
  }

  return groups;
}
