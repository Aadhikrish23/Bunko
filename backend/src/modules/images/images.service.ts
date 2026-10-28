import { createHash, randomUUID } from 'crypto';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { publicUrlFor, s3Client, S3_BUCKET } from '../../config/s3';
import { AppError } from '../../lib/app-error';
import { redisConnection } from '../../lib/queue';
import { sniffMimeType } from '../../lib/sniff-mime-type';
import type { ProcessImageInput, RequestImageUploadUrlInput } from './images.schema';

// Same signed-URL/pending-record TTL pairing as the files module (T-024) —
// see files.service.ts for why they share one value.
const UPLOAD_URL_EXPIRY_SECONDS = 900;

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// Images (unlike DigitalFile) are served straight back to the browser, so
// they live under one public-read prefix (shared with T-109's generated
// spine art — see publicUrlFor's own comment in config/s3.ts).
export const PUBLIC_PREFIX = 'covers';

interface PendingImageUpload {
  userId: string;
  fileName: string;
  mimeType: string;
  storageKey: string;
}

function pendingUploadKey(imageId: string): string {
  return `pending-image-upload:${imageId}`;
}

export interface ImageUploadUrlDto {
  imageId: string;
  uploadUrl: string;
}

export async function requestImageUploadUrl(userId: string, input: RequestImageUploadUrlInput): Promise<ImageUploadUrlDto> {
  if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
    throw new AppError('UNSUPPORTED_FILE', 'Only JPEG, PNG, and WebP images are supported');
  }

  const usage = await prisma.uploadedImage.aggregate({
    _sum: { sizeBytes: true },
    where: { userId },
  });
  const usedBytes = usage._sum.sizeBytes ?? 0;
  if (usedBytes + input.sizeBytes > env.USER_IMAGE_QUOTA_BYTES) {
    throw new AppError('FILE_TOO_LARGE', 'This upload would exceed your image storage quota');
  }

  const imageId = randomUUID();
  const storageKey = `${PUBLIC_PREFIX}/${userId}/${imageId}.${EXTENSION_BY_MIME_TYPE[input.mimeType]}`;

  const uploadUrl = await getSignedUrl(
    s3Client,
    new PutObjectCommand({ Bucket: S3_BUCKET, Key: storageKey, ContentType: input.mimeType }),
    { expiresIn: UPLOAD_URL_EXPIRY_SECONDS },
  );

  const pending: PendingImageUpload = { userId, fileName: input.fileName, mimeType: input.mimeType, storageKey };
  await redisConnection.set(pendingUploadKey(imageId), JSON.stringify(pending), 'EX', UPLOAD_URL_EXPIRY_SECONDS);

  return { imageId, uploadUrl };
}

export interface UploadedImageDto {
  id: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
}

function toDto(image: { id: string; publicUrl: string; mimeType: string; sizeBytes: number; checksum: string }): UploadedImageDto {
  return { id: image.id, url: image.publicUrl, mimeType: image.mimeType, sizeBytes: image.sizeBytes, checksum: image.checksum };
}

export async function confirmImageUpload(userId: string, imageId: string): Promise<UploadedImageDto> {
  const raw = await redisConnection.get(pendingUploadKey(imageId));
  if (!raw) {
    throw new AppError('NOT_FOUND', 'Upload not found or has expired');
  }

  const pending = JSON.parse(raw) as PendingImageUpload;
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

  // Dedup per user: reuse an existing upload with the same checksum
  // rather than storing a duplicate blob (same rule as DigitalFile,
  // DATA_MODEL.md §7).
  const existing = await prisma.uploadedImage.findFirst({ where: { checksum, userId } });
  if (existing) {
    await redisConnection.del(pendingUploadKey(imageId));
    return toDto(existing);
  }

  const image = await prisma.uploadedImage.create({
    data: {
      userId,
      storageKey: pending.storageKey,
      publicUrl: publicUrlFor(pending.storageKey),
      originalName: pending.fileName,
      mimeType: sniffedType,
      sizeBytes: buffer.byteLength,
      checksum,
    },
  });

  await redisConnection.del(pendingUploadKey(imageId));

  return toDto(image);
}

// Standard book-cover proportions (2:3, matching BookCover.tsx's
// aspect-[2/3]) at a size comfortable for both the shelf spine view and a
// book-detail hero image. "Upscale" (T-109) means resizing up to this
// target with a high-quality resampling kernel when the reader's cropped
// photo region is smaller than it -- sharp's `fit: 'fill'` + lanczos3
// handles both directions the same way.
const COVER_WIDTH = 600;
const COVER_HEIGHT = 900;

/**
 * Crops an already-uploaded photo to the rectangle the reader chose (a crop
 * UI on the client -- this never attempts to auto-detect the book in the
 * photo, which would need real computer vision this service doesn't have)
 * and resizes/upscales it to standard cover proportions. The result is
 * stored as a new UploadedImage, independent of the original photo.
 */
export async function processImage(userId: string, imageId: string, input: ProcessImageInput): Promise<UploadedImageDto> {
  const original = await prisma.uploadedImage.findFirst({ where: { id: imageId, userId } });
  if (!original) {
    throw new AppError('NOT_FOUND', 'Image not found');
  }

  const object = await s3Client.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: original.storageKey }));
  if (!object.Body) {
    throw new AppError('UNSUPPORTED_FILE', 'Image not found in storage');
  }
  const sourceBuffer = Buffer.from(await object.Body.transformToByteArray());

  const metadata = await sharp(sourceBuffer).metadata();
  if (!metadata.width || !metadata.height) {
    throw new AppError('UNSUPPORTED_FILE', "Couldn't read the image's dimensions");
  }

  const { crop } = input;
  const left = Math.round(crop.x * metadata.width);
  const top = Math.round(crop.y * metadata.height);
  // Clamp so rounding never pushes the extract box past the source edges.
  const width = Math.max(1, Math.min(Math.round(crop.width * metadata.width), metadata.width - left));
  const height = Math.max(1, Math.min(Math.round(crop.height * metadata.height), metadata.height - top));

  const processedBuffer = await sharp(sourceBuffer)
    .extract({ left, top, width, height })
    .resize(COVER_WIDTH, COVER_HEIGHT, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 90 })
    .toBuffer();

  const checksum = createHash('sha256').update(processedBuffer).digest('hex');
  const existing = await prisma.uploadedImage.findFirst({ where: { checksum, userId } });
  if (existing) {
    return toDto(existing);
  }

  const imageIdForResult = randomUUID();
  const storageKey = `${PUBLIC_PREFIX}/${userId}/${imageIdForResult}.jpg`;
  await s3Client.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: storageKey, Body: processedBuffer, ContentType: 'image/jpeg' }));

  const image = await prisma.uploadedImage.create({
    data: {
      userId,
      storageKey,
      publicUrl: publicUrlFor(storageKey),
      originalName: original.originalName,
      mimeType: 'image/jpeg',
      sizeBytes: processedBuffer.byteLength,
      checksum,
    },
  });

  return toDto(image);
}
