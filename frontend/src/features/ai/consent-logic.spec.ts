import { test, expect } from '@playwright/test';
import { revokeWarning, toggleConsent } from './consent-logic';

const off = { semanticSearch: false, generative: false };
const both = { semanticSearch: true, generative: true };

test.describe('toggleConsent', () => {
  test('turning generated insights on also turns semantic search on', () => {
    expect(toggleConsent(off, 'generative', true)).toEqual(both);
  });

  test('turning semantic search off also turns generated insights off', () => {
    expect(toggleConsent(both, 'semanticSearch', false)).toEqual(off);
  });

  test('each can be turned off or on alone where the rule allows', () => {
    expect(toggleConsent(both, 'generative', false)).toEqual({ semanticSearch: true, generative: false });
    expect(toggleConsent(off, 'semanticSearch', true)).toEqual({ semanticSearch: true, generative: false });
  });
});

test.describe('revokeWarning', () => {
  test('warns only when the index would be deleted', () => {
    expect(revokeWarning(both, off)).toContain('deletes your search index');
    expect(revokeWarning(both, { semanticSearch: true, generative: false })).toBeNull();
    expect(revokeWarning(off, both)).toBeNull();
  });
});
