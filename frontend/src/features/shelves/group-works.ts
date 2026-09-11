import type { Work } from '../../lib/api/types';

export interface WorkGroup {
  label: string;
  works: Work[];
}

// Arranges a shelf's books the way a reader would organize a physical
// bookcase: series stay together first, then by genre, with anything
// left over in its own row — rather than one long undifferentiated row.
export function groupWorksForShelf(works: Work[]): WorkGroup[] {
  const bySeriesName = new Map<string, Work[]>();
  const remaining: Work[] = [];

  for (const work of works) {
    if (work.seriesName) {
      const group = bySeriesName.get(work.seriesName) ?? [];
      group.push(work);
      bySeriesName.set(work.seriesName, group);
    } else {
      remaining.push(work);
    }
  }

  const byGenre = new Map<string, Work[]>();
  const ungrouped: Work[] = [];
  for (const work of remaining) {
    const genre = work.genres[0];
    if (genre) {
      const group = byGenre.get(genre) ?? [];
      group.push(work);
      byGenre.set(genre, group);
    } else {
      ungrouped.push(work);
    }
  }

  const groups: WorkGroup[] = [
    ...[...bySeriesName.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, groupWorks]) => ({ label, works: groupWorks })),
    ...[...byGenre.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, groupWorks]) => ({ label, works: groupWorks })),
  ];

  if (ungrouped.length > 0) {
    // "More Books" once there's already a series/genre row above it;
    // otherwise this is the only row, so a generic "Books" label reads
    // better than repeating a section heading above it.
    groups.push({ label: groups.length > 0 ? 'More Books' : 'Books', works: ungrouped });
  }

  return groups;
}
