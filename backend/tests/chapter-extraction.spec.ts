import { createWorker } from 'tesseract.js';
import { test, expect } from './fixtures/auth.fixture';
import { indexEpub } from '../src/modules/reader/epub-indexer';
import {
  indexPdf,
  joinTextItems,
  looksLikeGarbledText,
  normalizePageText,
  type PdfTextItem,
} from '../src/modules/reader/pdf-indexer';
import { resolveOcrLanguage } from '../src/modules/reader/ocr-language';
import { generateSampleEpub } from './fixtures/generate-sample-epub';
import { generateScannedPdf, generateScannedPdfWithOutline } from './fixtures/generate-scanned-pdf';

// Builds a fake pdf.js TextItem — real coordinates matter here (they
// drive joinTextItems's spacing/footnote-skip heuristics), so tests
// construct them directly rather than via a real rendered PDF, which
// can't pin down exact glyph positions deterministically.
function textItem(
  str: string,
  x: number,
  y: number,
  width: number,
  fontSize: number,
  hasEOL = false
): PdfTextItem {
  return { str, transform: [fontSize, 0, 0, fontSize, x, y], width, height: fontSize, hasEOL };
}

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

test.describe('joinTextItems (PDF text-layer spacing reconstruction)', () => {
  test('does not split a word around a mid-word superscript footnote marker', () => {
    // Reproduces the real bug this was written to fix: "What do you
    // mean" extracted from a live PDF came out as "W 1 hat do you mean"
    // because a footnote-reference "1", superscript and smaller than the
    // body text, sat between the "W" and "hat" runs in the content
    // stream. Geometry below mirrors that: "W" and "hat" are on the same
    // baseline (y=700) with the footnote occupying the horizontal gap
    // between them, raised and shrunk.
    const items = [
      textItem('W', 100, 700, 7, 10),
      textItem('1', 108, 706, 4, 6), // superscript, smaller font — the footnote marker
      textItem('hat', 112, 700, 18, 10),
      textItem(' do', 131, 700, 15, 10),
    ];

    expect(joinTextItems(items)).toBe('What do');
  });

  test('inserts a space at a genuine word boundary', () => {
    const items = [textItem('Hello', 100, 700, 30, 10), textItem('world', 140, 700, 30, 10)];
    expect(joinTextItems(items)).toBe('Hello world');
  });

  test('does not insert a space between adjacent glyph runs of the same word', () => {
    // Some PDFs split a single word across text runs (kerning pairs,
    // drop caps) with no real gap between them — this must not become
    // "Hel lo".
    const items = [textItem('Hel', 100, 700, 15, 10), textItem('lo', 115, 700, 10, 10)];
    expect(joinTextItems(items)).toBe('Hello');
  });

  test('turns hasEOL into a newline instead of a space, preserving paragraph structure', () => {
    const items = [
      textItem('First line.', 100, 700, 60, 10, true),
      textItem('Second line.', 100, 685, 65, 10),
    ];
    expect(joinTextItems(items)).toBe('First line.\nSecond line.');
  });

  test('keeps a body-sized inline number intact (does not mistake it for a footnote marker)', () => {
    // A same-size, same-baseline "2024" must survive — the footnote
    // heuristic only fires on a *smaller, vertically-offset* number.
    const items = [
      textItem('Copyright', 100, 700, 50, 10),
      textItem('2024', 153, 700, 25, 10),
    ];
    expect(joinTextItems(items)).toBe('Copyright 2024');
  });
});

test.describe('normalizePageText', () => {
  test('collapses repeated spaces/tabs without eating the newlines joinTextItems inserted', () => {
    expect(normalizePageText('Hello   world.\n\nNext   paragraph.')).toBe('Hello world.\n\nNext paragraph.');
  });

  test('collapses 3+ consecutive newlines down to a single paragraph break', () => {
    expect(normalizePageText('One.\n\n\n\nTwo.')).toBe('One.\n\nTwo.');
  });

  test('trims leading/trailing whitespace', () => {
    expect(normalizePageText('  \n Hello.  \n ')).toBe('Hello.');
  });
});

test.describe('looksLikeGarbledText (legacy non-Unicode font detection)', () => {
  test('does not flag clean English prose', () => {
    const text =
      'What do you mean, not enough rooms? I said to Arijit Banerjee, the lobby manager of the Goa Marriott.';
    expect(looksLikeGarbledText(text)).toBe(false);
  });

  test('does not flag clean Tamil Unicode prose', () => {
    // A plain, generic factual sentence (Tamil is an ancient language,
    // spoken in India) — real Tamil letters are \p{L}, same as any other
    // script's, so this must not be mistaken for corruption.
    const text = 'தமிழ் ஒரு பழமையான மொழி. இது இந்தியாவில் பேசப்படுகிறது.';
    expect(looksLikeGarbledText(text)).toBe(false);
  });

  test('flags Tamil text extracted through a legacy non-Unicode font', () => {
    // Mirrors what a real legacy-font (TSCII/Bamini/Vanavil-style) PDF
    // actually produces: genuine Tamil letters still present, but
    // interleaved with stray symbols the font's private encoding
        // happened to reuse in place of the letters it couldn't represent.
    const text = 'த{மிழ்} ஒ¶ரு பழ²மையான மொ£ழி~ . இ`து இந்தி{யாவில்} பேச¶ப்படு²கிறது~.';
    expect(looksLikeGarbledText(text)).toBe(true);
  });

  test('does not judge very short strings either way', () => {
    expect(looksLikeGarbledText('Hi')).toBe(false);
    expect(looksLikeGarbledText('{}~²')).toBe(false);
  });
});

test.describe('resolveOcrLanguage', () => {
  test('maps a known display name to its Tesseract code, case-insensitively', () => {
    expect(resolveOcrLanguage('Tamil')).toBe('tam');
    expect(resolveOcrLanguage('tamil')).toBe('tam');
    expect(resolveOcrLanguage('ENGLISH')).toBe('eng');
  });

  test('falls back to English when nothing is provided or recognized', () => {
    expect(resolveOcrLanguage(null, undefined)).toBe('eng');
    expect(resolveOcrLanguage('Klingon')).toBe('eng');
  });

  test('prefers the first matching candidate in priority order', () => {
    // Mirrors ocr-backfill.job.ts's call: Edition.language first, then
    // Work.language, then Work.originalLanguage.
    expect(resolveOcrLanguage(null, 'Tamil', 'English')).toBe('tam');
    expect(resolveOcrLanguage('Hindi', 'Tamil', 'English')).toBe('hin');
  });
});
