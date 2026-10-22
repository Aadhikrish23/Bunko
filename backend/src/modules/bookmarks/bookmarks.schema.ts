import { z } from 'zod';

export const editionIdParamsSchema = z.object({ editionId: z.string().uuid() }).strict();
export const bookmarkIdParamsSchema = z.object({ id: z.string().uuid() }).strict();

export const createBookmarkSchema = z
  .object({
    // Optional client-generated id: lets a retried request (or a one-time
    // import of a browser's old local bookmarks) be idempotent.
    id: z.string().uuid().optional(),
    position: z.string().min(1).max(500),
    label: z.string().trim().min(1).max(120),
  })
  .strict();

export type CreateBookmarkInput = z.infer<typeof createBookmarkSchema>;
