import type { ReadingStatus, Work } from '../../lib/api/types';

export type SortOption = 'title' | 'author' | 'addedAt' | 'status' | 'rating';

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'title', label: 'Title' },
  { value: 'author', label: 'Author' },
  { value: 'addedAt', label: 'Date added' },
  { value: 'status', label: 'Status' },
  { value: 'rating', label: 'Rating' },
];

// Reading-progress order, not alphabetical — a "sort by status" is meant
// to read like a shelf of to-read, then in-progress, then done.
const STATUS_SORT_RANK: Record<ReadingStatus, number> = {
  READING: 0,
  WANT_TO_READ: 1,
  FINISHED: 2,
  DID_NOT_FINISH: 3,
};

export function sortWorksForOption(works: Work[], option: SortOption): Work[] {
  const sorted = [...works];
  switch (option) {
    case 'title':
      sorted.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case 'author':
      sorted.sort((a, b) => (a.authors[0] ?? '').localeCompare(b.authors[0] ?? ''));
      break;
    case 'addedAt':
      sorted.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
      break;
    case 'status':
      sorted.sort((a, b) => STATUS_SORT_RANK[a.status] - STATUS_SORT_RANK[b.status]);
      break;
    case 'rating':
      sorted.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
      break;
  }
  return sorted;
}
