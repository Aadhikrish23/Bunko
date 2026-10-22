import { z } from 'zod';

export const workIdParamsSchema = z
  .object({
    workId: z.string().uuid(),
  })
  .strict();

// SRS §14: "configurable scale, with 5-star rating as the initial
// default" — MVP hardcodes the 1-5 range; a later configurable-scale
// ticket would widen this, not change the field itself.
const RATING = z.number().int().min(1).max(5);

export const upsertReviewSchema = z
  .object({
    rating: RATING.nullable().optional(),
    body: z.string().max(10_000).nullable().optional(),
    isFavourite: z.boolean().optional(),
    rereadIntention: z.boolean().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .strict();

export const updateReviewSchema = z
  .object({
    rating: RATING.nullable().optional(),
    body: z.string().max(10_000).nullable().optional(),
    isFavourite: z.boolean().optional(),
    rereadIntention: z.boolean().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .strict();

export type UpsertReviewInput = z.infer<typeof upsertReviewSchema>;
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;
