/**
 * Seeds a reader account for manual / black-box QA (T-105), against a LOCAL dev API only:
 * a small library across every status, two shelves, a rating and a note, and one readable
 * EPUB (an original novella written for QA, scripts/qa-sample-book.ts). Covers aren't passed:
 * the app finds title-matched ones itself, as it does for any book added without one. The assistant consent is left off, so a
 * tester meets the consent screen the way a new reader would.
 *
 *   npx ts-node -T scripts/seed-qa-reader.ts <apiBase> <email> <password>
 */
import { generateQaSampleBook } from './qa-sample-book';

const [base, email, password] = process.argv.slice(2);
if (!base || !email || !password || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(base)) {
  throw new Error('Usage: seed-qa-reader.ts http://localhost:<port>/api/v1 <email> <password> (local APIs only)');
}

async function call<T>(method: string, path: string, token: string | null, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { data: T };
  return { status: res.status, data: json.data };
}

async function main() {
  let auth = await call<{ accessToken: string }>('POST', '/auth/register', null, { email, password, displayName: 'Meera' });
  if (auth.status === 409) auth = await call('POST', '/auth/login', null, { email, password });
  const token = auth.data.accessToken;

  const books: { title: string; author: string; status: string; genres: string[] }[] = [
    { title: 'Piranesi', author: 'Susanna Clarke', status: 'READING', genres: ['Fantasy'] },
    { title: 'Circe', author: 'Madeline Miller', status: 'WANT_TO_READ', genres: ['Fantasy', 'Mythology'] },
    { title: 'The Left Hand of Darkness', author: 'Ursula K. Le Guin', status: 'WANT_TO_READ', genres: ['Science Fiction'] },
    { title: 'Dune', author: 'Frank Herbert', status: 'FINISHED', genres: ['Science Fiction'] },
    { title: 'Klara and the Sun', author: 'Kazuo Ishiguro', status: 'DID_NOT_FINISH', genres: ['Literary Fiction'] },
  ];
  const ids: Record<string, string> = {};
  for (const b of books) {
    const res = await call<{ id: string }>('POST', '/works', token, { title: b.title, authors: [b.author], genres: b.genres });
    ids[b.title] = res.data.id;
    if (b.status !== 'WANT_TO_READ') await call('PATCH', `/works/${res.data.id}`, token, { status: b.status });
  }
  await call('PUT', `/works/${ids.Dune}/review`, token, { rating: 5, body: 'The desert felt alive. Slow start, worth it.' });
  await call('POST', `/works/${ids.Piranesi}/notes`, token, { scope: 'BOOK', body: 'The statues feel like a memory palace.' });
  const sciFi = await call<{ id: string }>('POST', '/shelves', token, { name: 'Sci-Fi' });
  await call('POST', `/shelves/${sciFi.data.id}/works`, token, { workId: ids.Dune });
  await call('POST', `/shelves/${sciFi.data.id}/works`, token, { workId: ids['The Left Hand of Darkness'] });
  await call('POST', '/shelves', token, { name: 'Comfort Reads' });

  // One readable digital book: an original novella written for QA.
  const sample = generateQaSampleBook();
  const epub = sample.epub;
  const work = await call<{ id: string }>('POST', '/works', token, { title: sample.title, authors: [sample.author], genres: ['Fantasy'] });
  const upload = await call<{ fileId: string; uploadUrl: string }>('POST', '/files/upload-url', token, {
    fileName: 'the-lantern-keeper-of-aldmere.epub',
    mimeType: 'application/epub+zip',
    sizeBytes: epub.length,
  });
  const put = await fetch(upload.data.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/epub+zip' }, body: epub });
  if (!put.ok) throw new Error(`Upload failed: ${put.status}`);
  // The stored file has its own id (not the upload's): that's what a copy points at.
  const stored = await call<{ id: string }>('POST', `/files/${upload.data.fileId}/confirm`, token);
  const edition = await call<{ id: string }>('POST', '/editions', token, { workId: work.data.id, format: 'EPUB' });
  const copy = await call<{ id: string }>('POST', '/copies', token, { editionId: edition.data.id, digitalFileId: stored.data.id });
  if (copy.status !== 201) throw new Error(`Attaching the EPUB failed: ${copy.status}`);
  console.log(`Seeded ${email}: ${books.length + 1} books, 2 shelves, one readable EPUB.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
