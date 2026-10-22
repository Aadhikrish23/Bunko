import { z } from 'zod';
import { DEFAULT_TIME_ZONE, isValidTimeZone } from './day-buckets';

// IANA zone name the client is viewing from (e.g. "Asia/Kolkata") —
// see day-buckets.ts for why it's request-supplied. Omitting it keeps
// the T-023 behaviour of UTC day boundaries.
const timeZone = z
  .string()
  .max(64)
  .refine(isValidTimeZone, { message: 'tz must be a valid IANA time zone, e.g. "Europe/London"' })
  .default(DEFAULT_TIME_ZONE);

export const statisticsQuerySchema = z
  .object({
    tz: timeZone,
  })
  .strict();

export const trendsQuerySchema = z
  .object({
    range: z.enum(['daily', 'weekly', 'monthly', 'yearly', 'all-time']).default('daily'),
    tz: timeZone,
  })
  .strict();

export type StatisticsQuery = z.infer<typeof statisticsQuerySchema>;
export type TrendsQuery = z.infer<typeof trendsQuerySchema>;
