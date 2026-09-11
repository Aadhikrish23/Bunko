import { createHash, randomUUID } from 'crypto';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { s3Client, S3_BUCKET } from '../../config/s3';
import { AppError } from '../../lib/app-error';
import { redisConnection } from '../../lib/queue';
import type { RequestUploadUrlInput } from './files.schema';

// Signed URLs are time-limited (T-024) — the pending-upload record we
// need between upload-url and confirm (to know the declared filename,
// since /files/:id/confirm takes no body) shares the same TTL in Redis,
// so an expired signed URL and an expired "pending" record go stale
// together.
const UPLOAD_URL_EXPIRY_SECONDS = 900;

const ALLOWED_MIME_TYPES = new Set(['application/epub+zip', 'application/pdf']);

interface PendingUpload {
  userId: string;
  fileName: string;
  mimeType: string;
  storageKey: string;
}

function pendingUploadKey(fileId: string): string {
  return `pending-upload:${fileId}`;
}

export interface UploadUrlDto {
  fileId: string;
  uploadUrl: string;
}

export async function requestUploadUrl(userId: string, input: RequestUploadUrlInput): Promise<UploadUrlDto> {
  if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
    throw new AppError('UNSUPPORTED_FILE', 'Only EPUB and PDF files are supported');
  }

  const usage = await prisma.digitalFile.aggregate({
    _sum: { sizeBytes: true },
    where: { copy: { userId } },
  });
  const usedBytes = usage._sum.sizeBytes ?? 0;
  if (usedBytes + input.sizeBytes > env.USER_STORAGE_QUOTA_BYTES) {
    throw new AppError('FILE_TOO_LARGE', 'This upload would exceed your storage quota');
  }

  const fileId = randomUUID();
  const storageKey = `digital-files/${userId}/${fileId}`;

  const uploadUrl = await getSignedUrl(
    s3Client,
    new PutObjectCommand({ Bucket: S3_BUCKET, Key: storageKey, ContentType: input.mimeType }),
    { expiresIn: UPLOAD_URL_EXPIRY_SECONDS },
  );

  const pending: PendingUpload = { userId, fileName: input.fileName, mimeType: input.mimeType, storageKey };
  await redisConnection.set(pendingUploadKey(fileId), JSON.stringify(pending), 'EX', UPLOAD_URL_EXPIRY_SECONDS);

  return { fileId, uploadUrl };
}

export interface DigitalFileDto {
  id: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
}

// First-line content sniffing at confirm time (T-024) — never trust the
// client-reported MIME type (CODING_STANDARDS.md §4). Deeper
// format-specific structural validation happens at import/indexing time
// (T-025/T-026), which can degrade gracefully; this check just rejects
// content that plainly isn't a ZIP (EPUB) or PDF at all.
function sniffMimeType(buffer: Buffer): string | null {
  const isZip = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
  if (isZip) {
    return 'application/epub+zip';
  }
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    return 'application/pdf';
  }
  return null;
}

export async function confirmUpload(userId: string, fileId: string): Promise<DigitalFileDto> {
  const raw = await redisConnection.get(pendingUploadKey(fileId));
  if (!raw) {
    throw new AppError('NOT_FOUND', 'Upload not found or has expired');
  }

  const pending = JSON.parse(raw) as PendingUpload;
  if (pending.userId !== userId) {
    throw new AppError('NOT_FOUND', 'Upload not found or has expired');
  }

  const object = await s3Client.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: pending.storageKey }));
  if (!object.Body) {
    throw new AppError('UNSUPPORTED_FILE', 'Uploaded file is empty');
  }
  const buffer = Buffer.from(await object.Body.transformToByteArray());

  const sniffedType = sniffMimeType(buffer);
  if (!sniffedType || sniffedType !== pending.mimeType) {
    throw new AppError('UNSUPPORTED_FILE', 'File content does not match its declared type');
  }

  const checksum = createHash('sha256').update(buffer).digest('hex');

  // Dedup per user (DATA_MODEL.md §7): reuse an existing DigitalFile with
  // the same checksum rather than storing a duplicate blob.
  const existing = await prisma.digitalFile.findFirst({ where: { checksum, copy: { userId } } });
  if (existing) {
    await redisConnection.del(pendingUploadKey(fileId));
    return {
      id: existing.id,
      mimeType: existing.mimeType,
      sizeBytes: existing.sizeBytes,
      checksum: existing.checksum,
    };
  }

  const digitalFile = await prisma.digitalFile.create({
    data: {
      storageKey: pending.storageKey,
      originalName: pending.fileName,
      mimeType: sniffedType,
      sizeBytes: buffer.byteLength,
      checksum,
    },
  });

  await redisConnection.del(pendingUploadKey(fileId));

  return {
    id: digitalFile.id,
    mimeType: digitalFile.mimeType,
    sizeBytes: digitalFile.sizeBytes,
    checksum: digitalFile.checksum,
  };
}
