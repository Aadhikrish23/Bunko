import { randomUUID } from 'crypto';
import type { APIRequestContext } from '@playwright/test';
import { test, expect } from './fixtures/auth.fixture';
import { prisma } from '../src/config/prisma';
import { hashChapterText } from '../src/modules/ai/chapter-hash';
import { CURRENT_CHAPTER_GRAPH_VERSION } from '../src/modules/reader/chapter-graph';

// These run without an ai-service configured (the default test setup), so
// they cover consent, scoping, and graceful degradation; the generation
// paths themselves are covered by ai-service's own tests.

test.describe('AI consent (T-078)', () => {
  test('requires authentication', async ({ request }) => {
    expect((await request.get('/api/v1/ai/status')).status()).toBe(401);
  });

  test('everything is off until the user opts in', async ({ authedRequest }) => {
    const status = (await (await authedRequest.get('/api/v1/ai/status')).json()).data;
    expect(status.consent).toEqual({ semanticSearch: false, generative: false, translation: false, policyVersion: null });
    expect(typeof status.currentPolicyVersion).toBe('string');
  });

  test('generated insights cannot be on without semantic search', async ({ authedRequest }) => {
    const response = await authedRequest.put('/api/v1/ai/consent', { data: { semanticSearch: false, generative: true, translation: false } });
    expect(response.status()).toBe(400);
  });

  test('consent is stored with the policy version agreed to', async ({ authedRequest }) => {
    const response = await authedRequest.put('/api/v1/ai/consent', { data: { semanticSearch: true, generative: true, translation: false } });
    expect(response.status()).toBe(200);
    const status = (await response.json()).data;
    expect(status.consent).toMatchObject({ semanticSearch: true, generative: true });
    expect(status.consent.policyVersion).toBe(status.currentPolicyVersion);
  });

  test('revoking semantic search deletes the user’s embeddings', async ({ authedRequest, testUser }) => {
    await authedRequest.put('/api/v1/ai/consent', { data: { semanticSearch: true, generative: false, translation: false } });
    const work = await authedRequest.post('/api/v1/works', {
      data: { title: `AI Book ${randomUUID()}`, coverImageUrl: 'https://example.com/c.jpg' },
    });
    const workId = (await work.json()).data.id;
    const vector = `[${Array.from({ length: 384 }, () => '0').join(',')}]`;
    await prisma.$executeRaw`
      INSERT INTO "AiEmbedding" (id, "userId", "sourceType", "sourceId", "workId", content, "contentHash", embedding)
      VALUES (${randomUUID()}, ${testUser.userId}, 'NOTE'::"AiSourceType", ${randomUUID()}, ${workId}, 'x', 'h', ${vector}::vector)`;

    await authedRequest.put('/api/v1/ai/consent', { data: { semanticSearch: false, generative: false, translation: false } });
    expect(await prisma.aiEmbedding.count({ where: { userId: testUser.userId } })).toBe(0);
  });
});

test.describe('AI features without consent or service', () => {
  test('search and generation are refused without consent', async ({ authedRequest }) => {
    expect((await authedRequest.get('/api/v1/ai/search?q=courage')).status()).toBe(403);
    expect((await authedRequest.post('/api/v1/ai/ask', { data: { question: 'What did I think?' } })).status()).toBe(403);
    expect((await authedRequest.post('/api/v1/ai/insights')).status()).toBe(403);
  });

  test('with consent but no ai-service configured, features report unavailable (503)', async ({ authedRequest }) => {
    await authedRequest.put('/api/v1/ai/consent', { data: { semanticSearch: true, generative: true, translation: false } });
    const status = (await (await authedRequest.get('/api/v1/ai/status')).json()).data;
    expect(status.available).toEqual({ semanticSearch: false, generative: false, translation: false });

    const search = await authedRequest.get('/api/v1/ai/search?q=courage');
    expect(search.status()).toBe(503);
    expect((await search.json()).error.code).toBe('AI_UNAVAILABLE');
  });

  test('a book summary is only for books in the caller’s library', async ({ authedRequest }) => {
    await authedRequest.put('/api/v1/ai/consent', { data: { semanticSearch: true, generative: true, translation: false } });
    expect((await authedRequest.post(`/api/v1/ai/works/${randomUUID()}/summary`)).status()).toBe(404);
  });
});

// Phase 11 (T-088, T-090). A digital copy with an already-indexed chapter
// graph is set up directly, so no file upload or S3 is needed.
async function digitalEditionWithChapters(
  authedRequest: APIRequestContext,
  userId: string,
  chapters: Array<{ structuralId: string; text: string }>,
): Promise<string> {
  const work = await authedRequest.post('/api/v1/works', { data: { title: `Translate ${randomUUID()}` } });
  const workId = (await work.json()).data.id;
  const edition = await authedRequest.post('/api/v1/editions', { data: { workId, format: 'EPUB' } });
  const editionId = (await edition.json()).data.id;
  const units = chapters.map((chapter, order) => ({
    ...chapter,
    label: `Chapter ${order + 1}`,
    order,
    pageNumber: null,
    textAnchors: [],
  }));
  await prisma.edition.update({
    where: { id: editionId },
    data: { chapterGraph: { version: CURRENT_CHAPTER_GRAPH_VERSION, format: 'EPUB', hasTextLayer: true, units } },
  });
  const file = await prisma.digitalFile.create({
    data: { storageKey: `test/${randomUUID()}.epub`, originalName: 'book.epub', mimeType: 'application/epub+zip', sizeBytes: 1, checksum: randomUUID() },
  });
  await prisma.copy.create({ data: { userId, editionId, digitalFileId: file.id } });
  return editionId;
}

test.describe('Chapter translation (T-088, T-090)', () => {
  const consentOn = { semanticSearch: false, generative: false, translation: true };

  test('translation consent is separate, off by default, and needs no other consent', async ({ authedRequest }) => {
    const status = (await (await authedRequest.get('/api/v1/ai/status')).json()).data;
    expect(status.consent.translation).toBe(false);
    expect(status.translationLanguages).toContainEqual({ code: 'ar', name: 'Arabic', rtl: true });

    const response = await authedRequest.put('/api/v1/ai/consent', { data: consentOn });
    expect(response.status()).toBe(200);
    expect((await response.json()).data.consent).toMatchObject(consentOn);
  });

  test('requesting a translation needs consent and a supported language', async ({ authedRequest, testUser }) => {
    const editionId = await digitalEditionWithChapters(authedRequest, testUser.userId, [{ structuralId: 'ch1', text: 'Hello.' }]);
    const url = `/api/v1/ai/editions/${editionId}/translations`;

    expect((await authedRequest.post(url, { data: { structuralId: 'ch1', targetLanguage: 'fr' } })).status()).toBe(403);
    await authedRequest.put('/api/v1/ai/consent', { data: consentOn });
    expect((await authedRequest.post(url, { data: { structuralId: 'ch1', targetLanguage: 'klingon' } })).status()).toBe(400);
  });

  test('only a copy the caller holds, and a chapter that exists, can be translated', async ({ authedRequest, testUser }) => {
    await authedRequest.put('/api/v1/ai/consent', { data: consentOn });
    const editionId = await digitalEditionWithChapters(authedRequest, testUser.userId, [{ structuralId: 'ch1', text: 'Hello.' }]);

    const missingChapter = await authedRequest.post(`/api/v1/ai/editions/${editionId}/translations`, {
      data: { structuralId: 'nope', targetLanguage: 'fr' },
    });
    expect(missingChapter.status()).toBe(404);

    const work = await authedRequest.post('/api/v1/works', { data: { title: `Not mine ${randomUUID()}` } });
    const edition = await authedRequest.post('/api/v1/editions', { data: { workId: (await work.json()).data.id, format: 'EPUB' } });
    const notHeld = await authedRequest.post(`/api/v1/ai/editions/${(await edition.json()).data.id}/translations`, {
      data: { structuralId: 'ch1', targetLanguage: 'fr' },
    });
    expect(notHeld.status()).toBe(404);
  });

  test('an over-long chapter is refused with a clear message', async ({ authedRequest, testUser }) => {
    await authedRequest.put('/api/v1/ai/consent', { data: consentOn });
    const editionId = await digitalEditionWithChapters(authedRequest, testUser.userId, [
      { structuralId: 'whole-book', text: 'word '.repeat(30_000) },
    ]);
    const response = await authedRequest.post(`/api/v1/ai/editions/${editionId}/translations`, {
      data: { structuralId: 'whole-book', targetLanguage: 'de' },
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).error.message).toContain('too long to translate');
  });

  test('without an ai-service, a valid request reports unavailable (503)', async ({ authedRequest, testUser }) => {
    await authedRequest.put('/api/v1/ai/consent', { data: consentOn });
    const editionId = await digitalEditionWithChapters(authedRequest, testUser.userId, [{ structuralId: 'ch1', text: 'Hello.' }]);
    const response = await authedRequest.post(`/api/v1/ai/editions/${editionId}/translations`, {
      data: { structuralId: 'ch1', targetLanguage: 'fr' },
    });
    expect(response.status()).toBe(503);
    expect((await response.json()).error.code).toBe('AI_UNAVAILABLE');
  });

  test('lists only the caller’s own translations, flags stale ones, and revoking deletes them', async ({
    authedRequest,
    testUser,
  }) => {
    await authedRequest.put('/api/v1/ai/consent', { data: consentOn });
    const editionId = await digitalEditionWithChapters(authedRequest, testUser.userId, [
      { structuralId: 'ch1', text: 'Hello.' },
      { structuralId: 'ch2', text: 'Goodbye.' },
    ]);
    const base = { editionId, targetLanguage: 'fr', charCount: 6, segmentsTotal: 1, segmentsDone: 1, status: 'READY' as const };
    await prisma.chapterTranslation.create({
      data: { ...base, userId: testUser.userId, structuralId: 'ch1', sourceHash: hashChapterText('Hello.'), text: 'Bonjour.' },
    });
    await prisma.chapterTranslation.create({
      data: { ...base, userId: testUser.userId, structuralId: 'ch2', sourceHash: 'old-text', text: 'Au revoir.' },
    });
    const other = await prisma.user.create({
      data: { email: `other-${randomUUID()}@example.com`, passwordHash: 'x', displayName: 'Other' },
    });
    await prisma.chapterTranslation.create({
      data: { ...base, userId: other.id, structuralId: 'ch1', sourceHash: hashChapterText('Hello.'), text: 'Not yours.' },
    });

    const list = (await (await authedRequest.get(`/api/v1/ai/editions/${editionId}/translations?targetLanguage=fr`)).json()).data;
    expect(list.map((t: { structuralId: string }) => t.structuralId)).toEqual(['ch1', 'ch2']);
    expect(list[0]).toMatchObject({ text: 'Bonjour.', stale: false, generated: true });
    expect(list[1]).toMatchObject({ stale: true });

    await authedRequest.put('/api/v1/ai/consent', { data: { ...consentOn, translation: false } });
    expect(await prisma.chapterTranslation.count({ where: { userId: testUser.userId } })).toBe(0);
    expect(await prisma.chapterTranslation.count({ where: { userId: other.id } })).toBe(1);
  });
});
