import { S3Client } from '@aws-sdk/client-s3';
import { env } from './env';

// forcePathStyle is required for MinIO (and most S3-compatible, non-AWS
// endpoints) — virtual-hosted-style bucket addressing doesn't work
// against them (ARCHITECTURE.md §1).
export const s3Client = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

export const S3_BUCKET = env.S3_BUCKET;
