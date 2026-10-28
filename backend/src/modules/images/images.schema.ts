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

// Crop is expressed as fractions (0-1) of the *source* image, not pixels --
// so a crop UI working in display coordinates never needs to know the
// original upload's real resolution (T-109).
const unitFraction = z.number().min(0).max(1);
export const processImageSchema = z
  .object({
    crop: z
      .object({ x: unitFraction, y: unitFraction, width: unitFraction, height: unitFraction })
      .strict()
      .refine((c) => c.x + c.width <= 1.0001 && c.y + c.height <= 1.0001, 'Crop rectangle must stay within the image'),
  })
  .strict();

export type RequestImageUploadUrlInput = z.infer<typeof requestImageUploadUrlSchema>;
export type ProcessImageInput = z.infer<typeof processImageSchema>;
