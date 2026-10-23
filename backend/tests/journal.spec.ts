import { randomUUID } from 'crypto';
import { test, expect } from './fixtures/auth.fixture';
import { positionLabel } from '../src/modules/journal/journal.service';

async function createEpubCopy(authedRequest: import('@playwright/test').APIRequestContext) {
  const work = await authedRequest.post('/api/v1/works', {
    data: { title: `Journal Test ${randomUUID()}`, coverImageUrl: 'https://example.com/cover.jpg' },
  });
  const workId = (await work.json()).data.id;
  const edition = await authedRequest.post('/api/v1/editions', { data: { workId, format: 'EPUB' } });
  const editionId = (await edition.json()).data.id;
  const copy = await authedRequest.post('/api/v1/copies', { data: { editionId } });
  const copyId = (await copy.json()).data.id;
  return { workId, editionId, copyId };
}

// T-049: a journal entry carries the annotations/notes made during that
// session (linked via sessionId at creation time), not just the
// session's own start/end/reflection fields.
test.describe('GET /journal annotations & notes (T-049)', () => {
  test('includes an annotation and a note created during the session', async ({ authedRequest }, testInfo) => {
    testInfo.setTimeout(60_000);
    const { editionId, workId, copyId } = await createEpubCopy(authedRequest);

    const started = await authedRequest.post('/api/v1/reading-sessions', { data: { copyId } });
    const sessionId = (await started.json()).data.id;

    await authedRequest.post(`/api/v1/editions/${editionId}/annotations`, {
      data: { kind: 'HIGHLIGHT', position: 'ch1', text: 'a session highlight', sessionId },
    });
    await authedRequest.post(`/api/v1/works/${workId}/notes`, {
      data: { scope: 'SESSION', body: 'a session note', sessionId },
    });

    await authedRequest.post(`/api/v1/reading-sessions/${sessionId}/end`, {
      data: { endPosition: 'ch1' },
    });

    const response = await authedRequest.get('/api/v1/journal');
    expect(response.status()).toBe(200);
    const entry = (await response.json()).data.find((e: { id: string }) => e.id === sessionId);
    expect(entry).toBeTruthy();
    expect(entry.annotations).toHaveLength(1);
    expect(entry.annotations[0].text).toBe('a session highlight');
    expect(entry.notes).toHaveLength(1);
    expect(entry.notes[0].body).toBe('a session note');
  });

  test('a session with no annotations or notes still has empty arrays', async ({ authedRequest }, testInfo) => {
    testInfo.setTimeout(60_000);
    const { copyId } = await createEpubCopy(authedRequest);

    const started = await authedRequest.post('/api/v1/reading-sessions', { data: { copyId } });
    const sessionId = (await started.json()).data.id;
    await authedRequest.post(`/api/v1/reading-sessions/${sessionId}/end`, { data: { endPosition: 'ch1' } });

    const response = await authedRequest.get('/api/v1/journal');
    const entry = (await response.json()).data.find((e: { id: string }) => e.id === sessionId);
    expect(entry.annotations).toEqual([]);
    expect(entry.notes).toEqual([]);
  });
});

// R2-07: positions read as chapters and pages, never raw CFIs or ids.
test.describe('journal position labels', () => {
  const units = [
    { editionId: 'e', structuralId: 'cover', label: 'Cover', order: 0 },
    { editionId: 'e', structuralId: 'ch1', label: 'The Last Lantern', order: 1 },
  ];

  test('a flow-reader chapter id and an EPUB CFI both become the chapter title', () => {
    expect(positionLabel('ch1', 'EPUB', units)).toBe('The Last Lantern');
    expect(positionLabel('epubcfi(/6/4!/4/2/1:0)', 'EPUB', units)).toBe('The Last Lantern');
  });

  test('pages and typed positions', () => {
    expect(positionLabel('42', 'PDF', [])).toBe('p. 42');
    expect(positionLabel('p. 112', 'PHYSICAL', [])).toBe('p. 112');
    expect(positionLabel('unknown-id', 'EPUB', units)).toBeNull();
    expect(positionLabel(null, 'EPUB', units)).toBeNull();
  });
});
