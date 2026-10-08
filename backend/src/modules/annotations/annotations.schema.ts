import { z } from 'zod';

export const editionIdParamsSchema = z
  .object({
    editionId: z.string().uuid(),
  })
  .strict();

export const annotationIdParamsSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

export const createAnnotationSchema = z
  .object({
    kind: z.enum(['HIGHLIGHT', 'QUOTE']),
    position: z.string().min(1),
    text: z.string().min(1).max(10_000),
    color: z.string().min(1).max(20).nullable().optional(),
    note: z.string().max(5_000).nullable().optional(),
    tags: z.array(z.string().min(1).max(40)).max(20).optional(),
    // The reader manifest auto-starts a session (T-040); the frontend
    // always has one to pass. Nullable/optional for the rare case a
    // highlight is made with no active session.
    sessionId: z.string().uuid().nullable().optional(),
  })
  .strict();

export const updateAnnotationSchema = z
  .object({
    note: z.string().max(5_000).nullable().optional(),
    color: z.string().min(1).max(20).nullable().optional(),
    tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  })
  .strict();

export type CreateAnnotationInput = z.infer<typeof createAnnotationSchema>;
export type UpdateAnnotationInput = z.infer<typeof updateAnnotationSchema>;
