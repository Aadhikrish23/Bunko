import { createWorker } from 'tesseract.js';
import { test, expect } from './fixtures/auth.fixture';
import { indexEpub } from '../src/modules/reader/epub-indexer';
import { indexPdf } from '../src/modules/reader/pdf-indexer';
import { generateSampleEpub } from './fixtures/generate-sample-epub';
import { generateScannedPdf, generateScannedPdfWithOutline } from './fixtures/generate-scanned-pdf';

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

  test('indexPdf without an OCR worker leaves a scanned PDF\'s text empty (T-026 baseline)', async () => {
    const buffer = generateScannedPdf(['Chapter One', 'Some scanned page content.']);
    const graph = await indexPdf(buffer);

    expect(graph.hasTextLayer).toBe(false);
    expect(graph.units.every((u) => u.text === '')).toBe(true);
  });

  test('indexPdf with an OCR worker backfills real text for a scanned PDF (T-037a)', async ({}, testInfo) => {
    testInfo.setTimeout(60_000); // real OCR work — language data + recognition
    const buffer = generateScannedPdf([
      'Chapter One',
      'Some scanned page content for the OCR test to recognize.',
      'It needs at least twelve words for text anchors to generate.',
    ]);
    const ocrWorker = await createWorker('eng');

    try {
      const graph = await indexPdf(buffer, { ocrWorker });

      // hasTextLayer stays honest about the source (it never had a real
      // PDF text layer) even though OCR filled in usable text.
      expect(graph.hasTextLayer).toBe(false);
      expect(graph.units).toHaveLength(1);
      expect(graph.units[0]!.text.toLowerCase()).toContain('chapter one');
      expect(graph.units[0]!.text.toLowerCase()).toContain('scanned page');
      // Real text also means real (non-empty) anchors for continuity mapping.
      expect(graph.units[0]!.textAnchors.length).toBeGreaterThan(0);
    } finally {
      await ocrWorker.terminate();
    }
  });

  test('indexPdf with an OCR worker backfills real per-chapter text for a scanned PDF WITH a bookmark outline (T-037a)', async (
    {},
    testInfo
  ) => {
    testInfo.setTimeout(60_000);
    const buffer = generateScannedPdfWithOutline([
      { title: 'Chapter One', lines: ['Chapter One', 'The first chapter begins on this scanned page right here.'] },
      { title: 'Chapter Two', lines: ['Chapter Two', 'The second chapter begins on this different scanned page.'] },
    ]);
    const ocrWorker = await createWorker('eng');

    try {
      const graph = await indexPdf(buffer, { ocrWorker });

      expect(graph.hasTextLayer).toBe(false);
      expect(graph.units).toHaveLength(2);
      expect(graph.units[0]!.label).toBe('Chapter One');
      expect(graph.units[1]!.label).toBe('Chapter Two');
      expect(graph.units[0]!.pageNumber).toBe(1);
      expect(graph.units[1]!.pageNumber).toBe(2);

      // Each chapter's OCR'd text is its own page's content, not the
      // other chapter's — proves extractPageRangeText -> ocrPageText is
      // rendering/recognizing the *correct* page per chapter, not just
      // reusing whichever page happened to be OCR'd first.
      expect(graph.units[0]!.text.toLowerCase()).toContain('first chapter');
      expect(graph.units[0]!.text.toLowerCase()).not.toContain('second chapter');
      expect(graph.units[1]!.text.toLowerCase()).toContain('second chapter');
      expect(graph.units[1]!.text.toLowerCase()).not.toContain('first chapter');
    } finally {
      await ocrWorker.terminate();
    }
  });
});
