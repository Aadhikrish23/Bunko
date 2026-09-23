import type { Work } from '../../lib/api/types';

const STORAGE_PREFIX = 'bunko:shelf-order:';

export function getShelfOrder(shelfKey: string): string[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${shelfKey}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveShelfOrder(shelfKey: string, workIds: string[]): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${shelfKey}`, JSON.stringify(workIds));
  } catch {
    // Storage quota or disabled in private mode — non-fatal
  }
}

export function sortWorksByOrder(works: Work[], savedOrder: string[]): Work[] {
  if (savedOrder.length === 0) return works;

  const orderMap = new Map<string, number>();
  savedOrder.forEach((id, index) => {
    orderMap.set(id, index);
  });

  return [...works].sort((a, b) => {
    const indexA = orderMap.get(a.id);
    const indexB = orderMap.get(b.id);

    if (indexA !== undefined && indexB !== undefined) {
      return indexA - indexB;
    }
    if (indexA !== undefined) return -1;
    if (indexB !== undefined) return 1;
    return 0;
  });
}
