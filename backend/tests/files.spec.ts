import { test, expect } from './fixtures/auth.fixture';

test.describe('POST /files/upload-url (T-024)', () => {
  test('requires authentication', async ({ request }) => {
    const response = await request.post('/api/v1/files/upload-url', {
      data: { fileName: 'book.epub', mimeType: 'application/epub+zip', sizeBytes: 1000 },
    });
    expect(response.status()).toBe(401);
  });

  test('rejects an upload that would exceed the storage quota', async ({ authedRequest }) => {
    const response = await authedRequest.post('/api/v1/files/upload-url', {
      data: {
        fileName: 'huge-book.epub',
        mimeType: 'application/epub+zip',
        sizeBytes: 10 * 1024 * 1024 * 1024, // 10 GB — well beyond the default 2 GB quota
      },
    });
    expect(response.status()).toBe(413);
    expect((await response.json()).error.code).toBe('FILE_TOO_LARGE');
  });

  test('rejects an unsupported mime type before it reaches the schema-level enum check', async ({ authedRequest }) => {
    const response = await authedRequest.post('/api/v1/files/upload-url', {
      data: { fileName: 'archive.zip', mimeType: 'application/zip', sizeBytes: 1000 },
    });
    // Rejected by the Zod enum (application/epub+zip | application/pdf only).
    expect(response.status()).toBe(400);
  });

  test('returns a time-limited signed URL', async ({ authedRequest }) => {
    const response = await authedRequest.post('/api/v1/files/upload-url', {
      data: { fileName: 'book.epub', mimeType: 'application/epub+zip', sizeBytes: 100_000 },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.fileId).toBeTruthy();
    const uploadUrl = new URL(body.data.uploadUrl);
    // Signed URLs are time-limited (T-024) — assert the expiry param is
    // present, not that S3/MinIO itself enforces it (that's AWS's
    // contract, not ours — docs/TESTING_STRATEGY.md §3).
    expect(uploadUrl.searchParams.get('X-Amz-Expires')).toBeTruthy();
  });
});

test.describe('POST /files/:fileId/confirm (T-024)', () => {
  test('requires authentication', async ({ request }) => {
    const response = await request.post('/api/v1/files/00000000-0000-0000-0000-000000000000/confirm');
    expect(response.status()).toBe(401);
  });

  test('rejects an unknown or expired fileId', async ({ authedRequest }) => {
    const response = await authedRequest.post('/api/v1/files/00000000-0000-0000-0000-000000000000/confirm');
    expect(response.status()).toBe(404);
  });

  // The full happy-path (real MinIO upload -> confirm -> mime sniff ->
  // DigitalFile row) needs a reachable S3-compatible endpoint, which this
  // environment doesn't have — see the note in the Phase 4 commit message.
});
