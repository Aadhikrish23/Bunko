import { z } from 'zod';

const readingStatusEnum = z.enum(['WANT_TO_READ', 'READING', 'FINISHED', 'DID_NOT_FINISH']);

export const createWorkSchema = z
  .object({
    title: z.string().min(1),
    authors: z.array(z.string().min(1)).default([]),
    seriesName: z.string().min(1).nullable().optional(),
    genres: z.array(z.string().min(1)).default([]),
    coverImageUrl: z.string().url().nullable().optional(),
    externalSource: z.string().min(1).nullable().optional(),
    externalId: z.string().min(1).nullable().optional(),
  })
  .strict();

export const updateWorkSchema = z
  .object({
    status: readingStatusEnum.optional(),
  })
  .strict();

export const listWorksQuerySchema = z
  .object({
    status: readingStatusEnum.optional(),
    shelfId: z.string().uuid().optional(),
    q: z.string().min(1).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const workIdParamsSchema = z
  .object({
    workId: z.string().uuid(),
  })
  .strict();

export type CreateWorkInput = z.infer<typeof createWorkSchema>;
export type UpdateWorkInput = z.infer<typeof updateWorkSchema>;
export type ListWorksQuery = z.infer<typeof listWorksQuerySchema>;
