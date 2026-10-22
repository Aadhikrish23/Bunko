import { test, expect } from '@playwright/test';
import { revokeWarning, toggleConsent } from './consent-logic';

const off = { semanticSearch: false, generative: false, translation: false };
const both = { semanticSearch: true, generative: true, translation: false };

test.describe('toggleConsent', () => {
  test('turning generated insights on also turns semantic search on', () => {
    expect(toggleConsent(off, 'generative', true)).toEqual(both);
  });

  test('turning semantic search off also turns generated insights off', () => {
    expect(toggleConsent(both, 'semanticSearch', false)).toEqual(off);
  });

  test('each can be turned off or on alone where the rule allows', () => {
    expect(toggleConsent(both, 'generative', false)).toEqual({ ...both, generative: false });
    expect(toggleConsent(off, 'semanticSearch', true)).toEqual({ ...off, semanticSearch: true });
  });

  test('translation is independent of the other two (SRS §20.5)', () => {
    expect(toggleConsent(off, 'translation', true)).toEqual({ ...off, translation: true });
    const all = { ...both, translation: true };
    expect(toggleConsent(all, 'semanticSearch', false)).toEqual({ ...off, translation: true });
    expect(toggleConsent(all, 'translation', false)).toEqual(both);
  });
});

test.describe('revokeWarning', () => {
  test('warns only when the index would be deleted', () => {
    expect(revokeWarning(both, off)).toContain('deletes your search index');
    expect(revokeWarning(both, { ...both, generative: false })).toBeNull();
    expect(revokeWarning(off, both)).toBeNull();
  });

  test('warns that turning translation off deletes saved translations', () => {
    const on = { ...off, translation: true };
    expect(revokeWarning(on, off)).toBe('This deletes the chapter translations you’ve saved.');
    expect(revokeWarning(off, on)).toBeNull();
  });
});
