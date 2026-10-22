import type { Chapter, ChapterTranslation, TranslationLanguage } from '../../lib/api/types';

// How the flow reader shows chapter translations (SRS §20.5, T-091). Pure,
// so it's unit-tested without a browser.

export interface DisplayChapter extends Chapter {
  // True when `text` is a machine translation rather than the book's own.
  translated: boolean;
}

// Only finished translations of the chapter's current text are shown; a
// stale one (the chapter was re-extracted since) falls back to the original.
export function usableTranslations(translations: ChapterTranslation[] | undefined): ChapterTranslation[] {
  return (translations ?? []).filter((t) => t.status === 'READY' && !t.stale && t.text);
}

// A stable identity for the usable set, so polling for progress (which
// returns new objects every few seconds) doesn't re-paginate the book
// unless a translation actually finished or changed.
export function translationsKey(translations: ChapterTranslation[]): string {
  return translations.map((t) => `${t.id}:${t.updatedAt}`).join('|');
}

export function applyTranslations(chapters: Chapter[], usable: ChapterTranslation[], show: boolean): DisplayChapter[] {
  const byChapter = new Map(show ? usable.map((t) => [t.structuralId, t.text!] as const) : []);
  return chapters.map((chapter) => {
    const text = byChapter.get(chapter.structuralId);
    return text ? { ...chapter, text, translated: true } : { ...chapter, translated: false };
  });
}

export type ChapterTranslationState =
  | { kind: 'none' }
  | { kind: 'pending'; done: number; total: number }
  | { kind: 'ready' }
  | { kind: 'stale' }
  | { kind: 'failed'; message: string };

export function chapterTranslationState(
  translations: ChapterTranslation[] | undefined,
  structuralId: string | null,
): ChapterTranslationState {
  const translation = structuralId ? translations?.find((t) => t.structuralId === structuralId) : undefined;
  if (!translation) return { kind: 'none' };
  if (translation.status === 'PENDING') {
    return { kind: 'pending', done: translation.segmentsDone, total: translation.segmentsTotal };
  }
  if (translation.status === 'FAILED') {
    return { kind: 'failed', message: translation.error ?? 'The translation could not be completed.' };
  }
  return translation.stale ? { kind: 'stale' } : { kind: 'ready' };
}

export function progressLabel(state: { done: number; total: number }): string {
  return state.total > 1 ? `Translating… part ${Math.min(state.done + 1, state.total)} of ${state.total}` : 'Translating…';
}

export function isRtl(languages: TranslationLanguage[] | undefined, code: string | null): boolean {
  return Boolean(code && languages?.find((language) => language.code === code)?.rtl);
}
