import { randomUUID } from 'crypto';
import type { APIRequestContext } from '@playwright/test';
import { test, expect } from './fixtures/auth.fixture';
import { prisma } from '../src/config/prisma';

// T-103: the library assistant through POST /assistant/chat, against the mock model
// (AI_PROVIDER=mock -- the test server sets it). Every test checks the database, not just the
// reply: the assistant must never say it changed something it didn't.

interface Reply {
  success: boolean;
  status: string;
  message: string;
  clarificationRequest?: { candidates: { label: string }[] };
}

async function chat(request: APIRequestContext, message: string): Promise<Reply> {
  const response = await request.post('/api/v1/assistant/chat', { data: { message } });
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()).data as Reply;
}

async function consent(request: APIRequestContext) {
  await request.put('/api/v1/ai/consent', { data: { semanticSearch: true, generative: true, translation: false } });
}

/** Books added directly (with a cover, so no live metadata lookup), returned by title. */
async function library(request: APIRequestContext, books: { title: string; authors?: string[] }[]) {
  const ids: Record<string, string> = {};
  for (const book of books) {
    const res = await request.post('/api/v1/works', {
      data: { title: book.title, authors: book.authors ?? [], coverImageUrl: 'https://example.com/c.jpg' },
    });
    ids[book.title] = (await res.json()).data.id;
  }
  return ids;
}

const statusOf = async (userId: string, workId: string) =>
  (await prisma.userWork.findUnique({ where: { userId_workId: { userId, workId } } }))?.status;

test.describe('assistant access (T-096)', () => {
  test('requires authentication', async ({ request }) => {
    expect((await request.post('/api/v1/assistant/chat', { data: { message: 'hi' } })).status()).toBe(401);
  });

  test('requires the generated-insights consent', async ({ authedRequest }) => {
    const response = await authedRequest.post('/api/v1/assistant/chat', { data: { message: 'hi' } });
    expect(response.status()).toBe(403);
  });

  test('rejects an empty message', async ({ authedRequest }) => {
    await consent(authedRequest);
    expect((await authedRequest.post('/api/v1/assistant/chat', { data: { message: '   ' } })).status()).toBe(400);
  });
});

test.describe('assistant changes the library (T-098 – T-100)', () => {
  test.beforeEach(async ({ authedRequest }) => consent(authedRequest));

  test('sets reading status, and DNF is a status, never a removal', async ({ authedRequest, testUser }) => {
    const ids = await library(authedRequest, [{ title: 'Piranesi' }, { title: 'Ulysses' }]);
    const started = await chat(authedRequest, 'I started Piranesi');
    expect(started.message).toContain('Piranesi as Reading');
    expect(await statusOf(testUser.userId, ids.Piranesi!)).toBe('READING');

    await chat(authedRequest, 'gave up on ulysses');
    expect(await statusOf(testUser.userId, ids.Ulysses!)).toBe('DID_NOT_FINISH');
  });

  test('"finsihed circe, 4 stars and put it on comfort reads" does all three without a model (R2-19)', async ({ authedRequest, testUser }) => {
    const ids = await library(authedRequest, [{ title: 'Circe', authors: ['Madeline Miller'] }, { title: 'Dune' }]);
    await chat(authedRequest, 'create a shelf called comfort reads');
    await chat(authedRequest, 'finsihed circe, 4 stars and put it on comfort reads');
    expect(await statusOf(testUser.userId, ids.Circe!)).toBe('FINISHED');
    const review = await prisma.review.findUnique({ where: { userId_workId: { userId: testUser.userId, workId: ids.Circe! } } });
    expect(review?.rating).toBe(4);
    const shelf = await prisma.shelf.findFirst({
      where: { userId: testUser.userId },
      include: { works: { include: { userWork: { include: { work: true } } } } },
    });
    expect(shelf?.works.map((w) => w.userWork.work.title)).toEqual(['Circe']);

    const undone = await chat(authedRequest, 'actually undo that');
    expect(undone.message).not.toMatch(/nothing for me to undo/i);
    expect(await statusOf(testUser.userId, ids.Circe!)).toBe('WANT_TO_READ');
  });

  test('a first name of an owned title is that book, never a new one (R2-03)', async ({ authedRequest, testUser }) => {
    const ids = await library(authedRequest, [{ title: 'Klara and the Sun', authors: ['Kazuo Ishiguro'] }, { title: 'Circe' }]);
    const reply = await chat(authedRequest, "dnf'd klara, the robot pov wasnt for me");
    expect(reply.message).not.toContain('added');
    expect(await statusOf(testUser.userId, ids['Klara and the Sun']!)).toBe('DID_NOT_FINISH');
    expect(await prisma.userWork.count({ where: { userId: testUser.userId } })).toBe(2);
  });

  test('rates (with the reader\'s own words) and deletes a review', async ({ authedRequest, testUser }) => {
    const ids = await library(authedRequest, [{ title: 'Dune', authors: ['Frank Herbert'] }]);
    const rated = await chat(authedRequest, 'rate dune 4, loved the worldbuilding');
    expect(rated.message).toContain('rated Dune 4 stars');
    const review = await prisma.review.findUnique({ where: { userId_workId: { userId: testUser.userId, workId: ids.Dune! } } });
    expect(review).toMatchObject({ rating: 4, body: 'loved the worldbuilding' });

    await chat(authedRequest, 'delete my review of dune');
    expect(await prisma.review.count({ where: { userId: testUser.userId, workId: ids.Dune! } })).toBe(0);
  });

  test('a rating that isn\'t whole stars is refused, not rounded', async ({ authedRequest, testUser }) => {
    const ids = await library(authedRequest, [{ title: 'Circe' }]);
    const reply = await chat(authedRequest, 'rate circe 4.5');
    expect(reply.message).toContain('whole stars');
    expect(await prisma.review.count({ where: { userId: testUser.userId, workId: ids.Circe! } })).toBe(0);
  });

  test('saves review text without a rating', async ({ authedRequest, testUser }) => {
    const ids = await library(authedRequest, [{ title: 'Circe' }]);
    await chat(authedRequest, 'review circe: the island chapters were gorgeous');
    const review = await prisma.review.findUnique({ where: { userId_workId: { userId: testUser.userId, workId: ids.Circe! } } });
    expect(review).toMatchObject({ rating: null, body: 'the island chapters were gorgeous' });
  });

  test('adds a note', async ({ authedRequest, testUser }) => {
    const ids = await library(authedRequest, [{ title: 'Dune' }]);
    const reply = await chat(authedRequest, 'note for dune: reread the desert chapters');
    expect(reply.message).toContain('added a note to Dune');
    const notes = await prisma.note.findMany({ where: { userId: testUser.userId, workId: ids.Dune! } });
    expect(notes.map((n) => [n.scope, n.body])).toEqual([['BOOK', 'reread the desert chapters']]);
  });

  test('creates shelves and moves several books on and off', async ({ authedRequest, testUser }) => {
    await library(authedRequest, [{ title: 'Dune' }, { title: 'Circe' }, { title: 'Pride and Prejudice' }]);
    await chat(authedRequest, 'put dune, circe and pride and prejudice on my comfort reads shelf');
    const shelf = await prisma.shelf.findFirst({ where: { userId: testUser.userId }, include: { works: { include: { userWork: { include: { work: true } } } } } });
    expect(shelf?.name).toBe('Comfort Reads');
    expect(shelf?.works.map((w) => w.userWork.work.title).sort()).toEqual(['Circe', 'Dune', 'Pride and Prejudice']);

    const off = await chat(authedRequest, 'take circe off the comfort reads shelf');
    expect(off.message).toContain("It's still in your library");
    expect(await prisma.shelfWork.count({ where: { shelfId: shelf!.id } })).toBe(2);
    expect(await prisma.userWork.count({ where: { userId: testUser.userId } })).toBe(3);

    await chat(authedRequest, 'create a shelf called book club');
    expect(await prisma.shelf.count({ where: { userId: testUser.userId, name: 'Book Club' } })).toBe(1);
  });

  test('removal asks first; "yes" removes exactly that book', async ({ authedRequest, testUser }) => {
    const ids = await library(authedRequest, [{ title: 'Twilight' }, { title: 'Dune' }]);
    const asked = await chat(authedRequest, 'remove twilight');
    expect(asked.status).toBe('CONFIRMATION_REQUIRED');
    expect(asked.clarificationRequest?.candidates.map((c) => c.label)).toContain('Yes, remove it');
    expect(await statusOf(testUser.userId, ids.Twilight!)).toBeDefined();

    const done = await chat(authedRequest, 'yes');
    expect(done.message).toContain('removed Twilight');
    expect(await statusOf(testUser.userId, ids.Twilight!)).toBeUndefined();
    expect(await statusOf(testUser.userId, ids.Dune!)).toBeDefined();
  });

  test('"no" to a removal keeps the book', async ({ authedRequest, testUser }) => {
    const ids = await library(authedRequest, [{ title: 'Twilight' }]);
    await chat(authedRequest, 'remove twilight');
    const kept = await chat(authedRequest, 'no');
    expect(kept.status).toBe('CANCELLED');
    expect(await statusOf(testUser.userId, ids.Twilight!)).toBeDefined();
  });

  test('a book that isn\'t in the library is named as missing, and nothing changes', async ({ authedRequest, testUser }) => {
    await library(authedRequest, [{ title: 'Dune' }]);
    const reply = await chat(authedRequest, 'remove harry potter');
    expect(reply.message).toContain("isn't in your library");
    expect(await prisma.userWork.count({ where: { userId: testUser.userId } })).toBe(1);
  });

  test('adds a book found by metadata search', async ({ authedRequest, testUser }) => {
    test.setTimeout(90_000); // a live metadata lookup
    const reply = await chat(authedRequest, 'add the hobbit by tolkien');
    const rows = await prisma.userWork.findMany({ where: { userId: testUser.userId }, include: { work: true } });
    if (rows.length === 0) {
      // The metadata providers can be unreachable from the test machine; the reply must say so, not claim an add.
      expect(reply.message).toMatch(/couldn't find/i);
      return;
    }
    expect(rows[0]!.work.title.toLowerCase()).toContain('hobbit');
    expect(rows[0]!.status).toBe('WANT_TO_READ');
    expect(reply.message).toContain('to your library as Want to Read');
  });
});

test.describe('assistant answers without changing anything (T-101)', () => {
  test.beforeEach(async ({ authedRequest }) => consent(authedRequest));

  test('a question never changes anything', async ({ authedRequest, testUser }) => {
    const ids = await library(authedRequest, [{ title: 'Dune' }]);
    const reply = await chat(authedRequest, 'did I finish dune?');
    expect(reply.message).toContain('Dune is marked Want to Read');
    expect(await statusOf(testUser.userId, ids.Dune!)).toBe('WANT_TO_READ');
    expect(await prisma.review.count({ where: { userId: testUser.userId } })).toBe(0);
  });

  test('answers library questions from the reader\'s data', async ({ authedRequest }) => {
    await library(authedRequest, [{ title: 'Piranesi' }, { title: 'Dune', authors: ['Frank Herbert'] }]);
    await chat(authedRequest, 'I started Piranesi');
    expect((await chat(authedRequest, 'what am I reading?')).message).toContain('Piranesi');
    expect((await chat(authedRequest, 'how many books do I have?')).message).toContain('2 books');
    expect((await chat(authedRequest, 'who wrote dune?')).message).toContain('Frank Herbert');
  });

  test('searches the library', async ({ authedRequest }) => {
    await library(authedRequest, [{ title: 'Dune', authors: ['Frank Herbert'] }, { title: 'Circe' }]);
    const reply = await chat(authedRequest, 'find frank herbert');
    expect(reply.message).toContain('Dune');
    expect(reply.message).not.toContain('Circe');
  });

  test('recommends from the Want to Read list', async ({ authedRequest }) => {
    await library(authedRequest, [{ title: 'Piranesi' }]);
    const reply = await chat(authedRequest, 'what should I read next?');
    expect(reply.message).toContain('Piranesi');
  });

  test('never reaches another reader\'s books', async ({ authedRequest, testUser }) => {
    const other = await prisma.user.create({ data: { email: `other-${randomUUID()}@example.com`, passwordHash: 'x', displayName: 'Other' } });
    const work = await prisma.work.create({ data: { title: 'Secret Diary', genres: [] } });
    await prisma.userWork.create({ data: { userId: other.id, workId: work.id } });
    const reply = await chat(authedRequest, 'remove secret diary');
    expect(reply.message).toContain("isn't in your library");
    expect(await prisma.userWork.count({ where: { userId: other.id } })).toBe(1);
    expect(testUser.userId).not.toBe(other.id);
  });
});

test.describe('assistant undo and reset (T-104)', () => {
  test.beforeEach(async ({ authedRequest }) => consent(authedRequest));

  test('undo puts back the last change', async ({ authedRequest, testUser }) => {
    const ids = await library(authedRequest, [{ title: 'Dune' }]);
    await chat(authedRequest, 'I started dune');
    await chat(authedRequest, 'rate dune 5');
    const undone = await chat(authedRequest, 'undo');
    expect(undone.message).toMatch(/^Undone/);
    expect(await prisma.review.count({ where: { userId: testUser.userId, workId: ids.Dune! } })).toBe(0);
    // Only the last change: the status set before it stays.
    expect(await statusOf(testUser.userId, ids.Dune!)).toBe('READING');
  });

  test('undo brings back a removed book', async ({ authedRequest, testUser }) => {
    const ids = await library(authedRequest, [{ title: 'Twilight' }]);
    await chat(authedRequest, 'remove twilight');
    await chat(authedRequest, 'yes');
    await chat(authedRequest, 'undo');
    expect(await statusOf(testUser.userId, ids.Twilight!)).toBe('WANT_TO_READ');
  });

  test('reset clears the conversation', async ({ authedRequest }) => {
    const response = await authedRequest.post('/api/v1/assistant/reset');
    expect(response.status()).toBe(200);
    expect((await response.json()).data).toEqual({ cleared: true });
  });
});
