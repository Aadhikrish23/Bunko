export interface Consent {
  semanticSearch: boolean;
  generative: boolean;
  translation: boolean;
}

// Generated insights retrieve the reader's notes through semantic search,
// so the two toggles move together where they must (mirrors the API rule).
// Translation stands alone (SRS §20.5).
export function toggleConsent(current: Consent, key: keyof Consent, on: boolean): Consent {
  if (key === 'translation') return { ...current, translation: on };
  if (key === 'generative') return { ...current, generative: on, semanticSearch: on || current.semanticSearch };
  return { ...current, semanticSearch: on, generative: on && current.generative };
}

// What the reader loses by turning something off — shown before it happens.
export function revokeWarning(current: Consent, next: Consent): string | null {
  const warnings: string[] = [];
  if (current.semanticSearch && !next.semanticSearch) {
    warnings.push(
      next.generative || current.generative
        ? 'This deletes your search index and turns off generated insights.'
        : 'This deletes your search index. Turning it back on rebuilds it.',
    );
  }
  if (current.translation && !next.translation) {
    warnings.push('This deletes the chapter translations you’ve saved.');
  }
  return warnings.length > 0 ? warnings.join(' ') : null;
}
