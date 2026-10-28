import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

// The single .env file lives at the repo root (README "Getting Started"),
// not inside backend/ — resolve it explicitly so this works regardless of
// the process's cwd. Silently no-ops if the file is absent (e.g. in CI,
// where these vars are already set directly in the job environment).
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  S3_ENDPOINT: z.string().min(1),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('30d'),
  FRONTEND_ORIGIN: z.string().default('http://localhost:5173'),
  USER_STORAGE_QUOTA_BYTES: z.coerce.number().default(2_147_483_648),
  // Cover photos/generated art (T-108) — a much smaller allowance than
  // digital book files, and tracked separately.
  USER_IMAGE_QUOTA_BYTES: z.coerce.number().default(52_428_800),
  // Base URL images are served back from (bucket + the public covers/
  // prefix must allow anonymous reads there — ARCHITECTURE.md §8).
  // Defaults to S3_ENDPOINT for local MinIO; set to a CDN/public host in
  // production.
  S3_PUBLIC_URL_BASE: z.string().optional(),
  SESSION_IDLE_TIMEOUT_MINUTES: z.coerce.number().default(5),
  SESSION_GRACE_WINDOW_MINUTES: z.coerce.number().default(15),
  MAPPING_CONFIDENCE_THRESHOLD: z.coerce.number().default(0.6),
  GOOGLE_BOOKS_API_KEY: z.string().optional(),
  HARDCOVER_API_KEY: z.string().optional(),
  // Phase 10 AI layer (ARCHITECTURE.md §8). Unset = AI features report
  // "unavailable" rather than failing.
  AI_SERVICE_URL: z.string().url().optional(),
  AI_SERVICE_TOKEN: z.string().min(16).optional(),
  AI_DAILY_GENERATION_LIMIT: z.coerce.number().int().min(0).default(30),
  // Phase 11: characters of book text a user can have translated per day.
  AI_DAILY_TRANSLATION_CHARS: z.coerce.number().int().min(0).default(200_000),
});

export const env = envSchema.parse(process.env);
