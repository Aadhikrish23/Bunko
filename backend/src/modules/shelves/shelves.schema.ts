import { z } from 'zod';

export const createShelfSchema = z
  .object({
    name: z.string().min(1).max(80),
  })
  .strict();

export const shelfIdParamsSchema = z
  .object({
    shelfId: z.string().uuid(),
  })
  .strict();

export const shelfWorkParamsSchema = z
  .object({
    shelfId: z.string().uuid(),
    workId: z.string().uuid(),
  })
  .strict();

export const assignWorkSchema = z
  .object({
    workId: z.string().uuid(),
  })
  .strict();

export type CreateShelfInput = z.infer<typeof createShelfSchema>;
export type AssignWorkInput = z.infer<typeof assignWorkSchema>;
