import { z } from 'zod';

export const requestImageUploadUrlSchema = z
  .object({
    fileName: z.string().min(1),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    sizeBytes: z.coerce.number().int().positive(),
  })
  .strict();

export const imageIdParamsSchema = z
  .object({
    imageId: z.string().uuid(),
  })
  .strict();

export type RequestImageUploadUrlInput = z.infer<typeof requestImageUploadUrlSchema>;
