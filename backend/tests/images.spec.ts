import { test, expect } from './fixtures/auth.fixture';

test.describe('POST /images/upload-url (T-108)', () => {
  test('requires authentication', async ({ request }) => {
    const response = await request.post('/api/v1/images/upload-url', {
      data: { fileName: 'cover.jpg', mimeType: 'image/jpeg', sizeBytes: 1000 },
    });
    expect(response.status()).toBe(401);
  });

  test('rejects an upload that would exceed the image storage quota', async ({ authedRequest }) => {
    const response = await authedRequest.post('/api/v1/images/upload-url', {
      data: {
        fileName: 'huge-cover.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 500 * 1024 * 1024, // 500 MB — well beyond the default 50 MB quota
      },
    });
    expect(response.status()).toBe(413);
    expect((await response.json()).error.code).toBe('FILE_TOO_LARGE');
  });

  test('rejects an unsupported mime type before it reaches the schema-level enum check', async ({ authedRequest }) => {
    const response = await authedRequest.post('/api/v1/images/upload-url', {
      data: { fileName: 'scan.pdf', mimeType: 'application/pdf', sizeBytes: 1000 },
    });
    // Rejected by the Zod enum (image/jpeg | image/png | image/webp only).
    expect(response.status()).toBe(400);
  });

  test('returns a time-limited signed URL', async ({ authedRequest }) => {
    const response = await authedRequest.post('/api/v1/images/upload-url', {
      data: { fileName: 'cover.jpg', mimeType: 'image/jpeg', sizeBytes: 100_000 },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.imageId).toBeTruthy();
    const uploadUrl = new URL(body.data.uploadUrl);
    // Signed URLs are time-limited (T-024's pattern) — assert the expiry
    // param is present, not that S3/MinIO itself enforces it (that's
    // AWS's contract, not ours — docs/TESTING_STRATEGY.md §3).
    expect(uploadUrl.searchParams.get('X-Amz-Expires')).toBeTruthy();
  });
});

test.describe('POST /images/:imageId/confirm (T-108)', () => {
  test('requires authentication', async ({ request }) => {
    const response = await request.post('/api/v1/images/00000000-0000-0000-0000-000000000000/confirm');
    expect(response.status()).toBe(401);
  });

  test('rejects an unknown or expired imageId', async ({ authedRequest }) => {
    const response = await authedRequest.post('/api/v1/images/00000000-0000-0000-0000-000000000000/confirm');
    expect(response.status()).toBe(404);
  });

  // The full happy-path (real MinIO upload -> confirm -> mime sniff ->
  // UploadedImage row -> public URL) needs a reachable S3-compatible
  // endpoint, same constraint noted in files.spec.ts.
});
