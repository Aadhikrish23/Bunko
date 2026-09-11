import { z } from 'zod';

export const searchMetadataQuerySchema = z
  .object({
    q: z.string().min(1),
  })
  .strict();

export type SearchMetadataQuery = z.infer<typeof searchMetadataQuerySchema>;
