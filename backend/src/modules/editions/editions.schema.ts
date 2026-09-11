import { z } from 'zod';

export const createEditionSchema = z
  .object({
    workId: z.string().uuid(),
    format: z.enum(['PHYSICAL', 'EPUB', 'PDF']),
    publisher: z.string().min(1).nullable().optional(),
    language: z.string().min(1).nullable().optional(),
    isbn: z.string().min(1).nullable().optional(),
  })
  .strict();

export const createCopySchema = z
  .object({
    editionId: z.string().uuid(),
    digitalFileId: z.string().uuid().nullable().optional(),
  })
  .strict();

export type CreateEditionInput = z.infer<typeof createEditionSchema>;
export type CreateCopyInput = z.infer<typeof createCopySchema>;
