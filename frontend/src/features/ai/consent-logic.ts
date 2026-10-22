export interface Consent {
  semanticSearch: boolean;
  generative: boolean;
}

// Generated insights retrieve the reader's notes through semantic search,
// so the two toggles move together where they must (mirrors the API rule).
export function toggleConsent(current: Consent, key: keyof Consent, on: boolean): Consent {
  if (key === 'generative') return { generative: on, semanticSearch: on || current.semanticSearch };
  return { semanticSearch: on, generative: on && current.generative };
}

// What the reader loses by turning something off — shown before it happens.
export function revokeWarning(current: Consent, next: Consent): string | null {
  if (current.semanticSearch && !next.semanticSearch) {
    return next.generative || current.generative
      ? 'This deletes your search index and turns off generated insights.'
      : 'This deletes your search index. Turning it back on rebuilds it.';
  }
  return null;
}
