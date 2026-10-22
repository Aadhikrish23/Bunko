import { randomUUID } from 'crypto';
import { test, expect } from './fixtures/auth.fixture';
import { prisma } from '../src/config/prisma';

// These run without an ai-service configured (the default test setup), so
// they cover consent, scoping, and graceful degradation; the generation
// paths themselves are covered by ai-service's own tests.

test.describe('AI consent (T-078)', () => {
  test('requires authentication', async ({ request }) => {
    expect((await request.get('/api/v1/ai/status')).status()).toBe(401);
  });

  test('everything is off until the user opts in', async ({ authedRequest }) => {
    const status = (await (await authedRequest.get('/api/v1/ai/status')).json()).data;
    expect(status.consent).toEqual({ semanticSearch: false, generative: false, policyVersion: null });
    expect(typeof status.currentPolicyVersion).toBe('string');
  });

  test('generated insights cannot be on without semantic search', async ({ authedRequest }) => {
    const response = await authedRequest.put('/api/v1/ai/consent', { data: { semanticSearch: false, generative: true } });
    expect(response.status()).toBe(400);
  });

  test('consent is stored with the policy version agreed to', async ({ authedRequest }) => {
    const response = await authedRequest.put('/api/v1/ai/consent', { data: { semanticSearch: true, generative: true } });
    expect(response.status()).toBe(200);
    const status = (await response.json()).data;
    expect(status.consent).toMatchObject({ semanticSearch: true, generative: true });
    expect(status.consent.policyVersion).toBe(status.currentPolicyVersion);
  });

  test('revoking semantic search deletes the user’s embeddings', async ({ authedRequest, testUser }) => {
    await authedRequest.put('/api/v1/ai/consent', { data: { semanticSearch: true, generative: false } });
    const work = await authedRequest.post('/api/v1/works', {
      data: { title: `AI Book ${randomUUID()}`, coverImageUrl: 'https://example.com/c.jpg' },
    });
    const workId = (await work.json()).data.id;
    const vector = `[${Array.from({ length: 384 }, () => '0').join(',')}]`;
    await prisma.$executeRaw`
      INSERT INTO "AiEmbedding" (id, "userId", "sourceType", "sourceId", "workId", content, "contentHash", embedding)
      VALUES (${randomUUID()}, ${testUser.userId}, 'NOTE'::"AiSourceType", ${randomUUID()}, ${workId}, 'x', 'h', ${vector}::vector)`;

    await authedRequest.put('/api/v1/ai/consent', { data: { semanticSearch: false, generative: false } });
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
    await authedRequest.put('/api/v1/ai/consent', { data: { semanticSearch: true, generative: true } });
    const status = (await (await authedRequest.get('/api/v1/ai/status')).json()).data;
    expect(status.available).toEqual({ semanticSearch: false, generative: false });

    const search = await authedRequest.get('/api/v1/ai/search?q=courage');
    expect(search.status()).toBe(503);
    expect((await search.json()).error.code).toBe('AI_UNAVAILABLE');
  });

  test('a book summary is only for books in the caller’s library', async ({ authedRequest }) => {
    await authedRequest.put('/api/v1/ai/consent', { data: { semanticSearch: true, generative: true } });
    expect((await authedRequest.post(`/api/v1/ai/works/${randomUUID()}/summary`)).status()).toBe(404);
  });
});
