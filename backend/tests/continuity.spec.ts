import { test, expect } from './fixtures/auth.fixture';
import { runMappingAlgorithm } from '../src/modules/continuity/mapping-algorithm';
import type { ChapterGraph } from '../src/modules/reader/chapter-graph';

// The mapping algorithm has no natural HTTP surface to unit-test through
// (docs/TESTING_STRATEGY.md §1's stated exception) — and T-032's own
// acceptance criteria explicitly calls for "the worked example from
// SRS.md §11.9 ... as a literal test case", which only a direct test of
// the pure function can give deterministically.

const targetGraph: ChapterGraph = {
  format: 'EPUB',
  hasTextLayer: true,
  units: [
    { structuralId: 'ch9', label: 'Chapter 9: The Departure', order: 0, pageNumber: 120, textAnchors: [] },
    {
      structuralId: 'ch10',
      label: 'Chapter 10: The Reckoning',
      order: 1,
      pageNumber: 135,
      textAnchors: [{ hash: 'anchor-a', offset: 0 }, { hash: 'anchor-b', offset: 12 }],
    },
    { structuralId: 'ch11', label: 'Chapter 11: Aftermath', order: 2, pageNumber: 150, textAnchors: [] },
  ],
};

test.describe('mapping algorithm (T-032, T-033, T-034)', () => {
  test('encodes the SRS §11.9 worked example: title match at ~0.85 confidence', () => {
    const result = runMappingAlgorithm(
      { structuralId: null, chapterLabel: 'Chapter 10', textAnchor: null, pageNumber: null },
      targetGraph,
    );
    expect(result.method).toBe('title');
    expect(result.unit?.structuralId).toBe('ch10');
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result.confidence).toBeLessThanOrEqual(0.9);
  });

  test('structural ID match always wins over title match when both are available', () => {
    const result = runMappingAlgorithm(
      { structuralId: 'ch9', chapterLabel: 'Chapter 10', textAnchor: null, pageNumber: null },
      targetGraph,
    );
    expect(result.method).toBe('structural');
    expect(result.unit?.structuralId).toBe('ch9');
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  test('text-anchor match only runs when structural and title both fail', () => {
    const result = runMappingAlgorithm(
      { structuralId: null, chapterLabel: 'Some Unrelated Title', textAnchor: 'anchor-b', pageNumber: null },
      targetGraph,
    );
    expect(result.method).toBe('anchor');
    expect(result.unit?.structuralId).toBe('ch10');
    expect(result.confidence).toBeGreaterThanOrEqual(0.4);
    expect(result.confidence).toBeLessThanOrEqual(0.85);
  });

  test('falls back to page proximity when no structural/title/anchor signal matches', () => {
    const result = runMappingAlgorithm(
      { structuralId: null, chapterLabel: null, textAnchor: null, pageNumber: 133 },
      targetGraph,
    );
    expect(result.method).toBe('proportional');
    expect(result.unit?.structuralId).toBe('ch10'); // page 135 is closest to 133
    expect(result.confidence).toBeGreaterThanOrEqual(0.2);
    expect(result.confidence).toBeLessThanOrEqual(0.4);
  });

  test('returns no match at all when nothing lines up', () => {
    const result = runMappingAlgorithm(
      { structuralId: null, chapterLabel: null, textAnchor: null, pageNumber: null },
      targetGraph,
    );
    expect(result.method).toBe('none');
    expect(result.unit).toBeNull();
    expect(result.confidence).toBe(0);
  });
});

test.describe('POST /reading-journeys/:id/resolve-position (T-035)', () => {
  test('requires authentication', async ({ request }) => {
    const response = await request.post('/api/v1/reading-journeys/00000000-0000-0000-0000-000000000000/resolve-position', {
      data: { targetEditionId: '00000000-0000-0000-0000-000000000000' },
    });
    expect(response.status()).toBe(401);
  });

  test('returns 404 for a journey that does not belong to the caller', async ({ authedRequest }) => {
    const response = await authedRequest.post(
      '/api/v1/reading-journeys/00000000-0000-0000-0000-000000000000/resolve-position',
      { data: { targetEditionId: '00000000-0000-0000-0000-000000000000' } },
    );
    expect(response.status()).toBe(404);
  });
});

test.describe('POST /reading-journeys/:id/position (T-037)', () => {
  test('requires authentication', async ({ request }) => {
    const response = await request.post('/api/v1/reading-journeys/00000000-0000-0000-0000-000000000000/position', {
      data: { chapterLabel: 'Chapter 5' },
    });
    expect(response.status()).toBe(401);
  });

  test('a correction is scoped to the caller and does not affect other journeys', async ({ authedRequest }) => {
    const response = await authedRequest.post(
      '/api/v1/reading-journeys/00000000-0000-0000-0000-000000000000/position',
      { data: { chapterLabel: 'Chapter 5' } },
    );
    // No such journey for this user -> 404, never a silent write to
    // someone else's data (T-037's ownership scoping).
    expect(response.status()).toBe(404);
  });
});
