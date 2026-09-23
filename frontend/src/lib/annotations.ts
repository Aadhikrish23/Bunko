export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'orange';

export interface HighlightAnnotation {
  id: string;
  editionId: string;
  position: string; // CFI or page number
  text: string;
  color: HighlightColor;
  note?: string;
  isQuote?: boolean;
  createdAt: string;
}

export const COLOR_HEX_MAP: Record<HighlightColor, { bg: string; border: string; badge: string }> = {
  yellow: { bg: '#FEF08A', border: '#EAB308', badge: 'bg-yellow-200 text-yellow-900 border-yellow-400' },
  green: { bg: '#BBF7D0', border: '#22C55E', badge: 'bg-green-200 text-green-900 border-green-400' },
  blue: { bg: '#BFDBFE', border: '#3B82F6', badge: 'bg-blue-200 text-blue-900 border-blue-400' },
  pink: { bg: '#FBCFE8', border: '#EC4899', badge: 'bg-pink-200 text-pink-900 border-pink-400' },
  orange: { bg: '#FED7AA', border: '#F97316', badge: 'bg-orange-200 text-orange-900 border-orange-400' },
};

function storageKey(editionId: string): string {
  return `bunko:annotations:${editionId}`;
}

export function getAnnotations(editionId: string): HighlightAnnotation[] {
  try {
    const raw = localStorage.getItem(storageKey(editionId));
    return raw ? (JSON.parse(raw) as HighlightAnnotation[]) : [];
  } catch {
    return [];
  }
}

function save(editionId: string, items: HighlightAnnotation[]): void {
  try {
    localStorage.setItem(storageKey(editionId), JSON.stringify(items));
  } catch {
    // Ignore storage failure
  }
}

export function addAnnotation(
  editionId: string,
  data: Omit<HighlightAnnotation, 'id' | 'createdAt'>
): HighlightAnnotation[] {
  const newAnnotation: HighlightAnnotation = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  const list = [newAnnotation, ...getAnnotations(editionId)];
  save(editionId, list);
  return list;
}

export function removeAnnotation(editionId: string, annotationId: string): HighlightAnnotation[] {
  const list = getAnnotations(editionId).filter((a) => a.id !== annotationId);
  save(editionId, list);
  return list;
}

export function updateAnnotationNote(
  editionId: string,
  annotationId: string,
  note: string
): HighlightAnnotation[] {
  const list = getAnnotations(editionId).map((a) => (a.id === annotationId ? { ...a, note } : a));
  save(editionId, list);
  return list;
}
