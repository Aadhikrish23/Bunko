import { z } from 'zod';

export const editionIdParamsSchema = z
  .object({
    editionId: z.string().uuid(),
  })
  .strict();
