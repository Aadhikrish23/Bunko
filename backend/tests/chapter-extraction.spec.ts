import { test, expect } from './fixtures/auth.fixture';
import { indexEpub } from '../src/modules/reader/epub-indexer';
import { generateSampleEpub } from './fixtures/generate-sample-epub';

// Like continuity.spec.ts, this has no natural HTTP surface to test
// through end-to-end (the full reader-manifest happy path needs a real
// S3-compatible upload — see the note in reader.spec.ts) — a direct test
// of the pure indexing function is the deterministic alternative.

test.describe('chapter text extraction (flow-reader foundation)', () => {
  test('indexEpub keeps each chapter\'s full readable text, not just its normalized anchors', () => {
    const graph = indexEpub(generateSampleEpub());

    expect(graph.units).toHaveLength(2);
    expect(graph.units[0]!.text).toContain('Lorem ipsum dolor sit amet');
    expect(graph.units[1]!.text).toContain('Ut enim ad minim veniam');

    // Each chapter's text is its own — not leaking into the other's.
    expect(graph.units[0]!.text).not.toContain('Ut enim ad minim veniam');
    expect(graph.units[1]!.text).not.toContain('Lorem ipsum dolor sit amet');

    // HTML tags stripped, not just anchors computed from a hidden
    // normalized copy — this is real readable text.
    expect(graph.units[0]!.text).not.toContain('<p>');
    expect(graph.units[0]!.text).not.toContain('<h1>');
  });
});
