import { z } from 'zod';

export const requestUploadUrlSchema = z
  .object({
    fileName: z.string().min(1),
    mimeType: z.enum(['application/epub+zip', 'application/pdf']),
    sizeBytes: z.coerce.number().int().positive(),
  })
  .strict();

export const fileIdParamsSchema = z
  .object({
    fileId: z.string().uuid(),
  })
  .strict();

export type RequestUploadUrlInput = z.infer<typeof requestUploadUrlSchema>;
