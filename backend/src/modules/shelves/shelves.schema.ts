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

// Matches the Shelves UI's own tab-key format exactly (ShelvesPage.tsx):
// 'all', 'status:<READING_STATUS>', or 'shelf:<uuid>'. Rejecting anything
// else keeps this from becoming an arbitrary per-user key-value store.
export const arrangementParamsSchema = z
  .object({
    tabKey: z.string().regex(/^(all|status:[A-Z_]+|shelf:[0-9a-f-]{36})$/),
  })
  .strict();

export const saveArrangementSchema = z
  .object({
    workIds: z.array(z.string().uuid()).max(1000),
  })
  .strict();

export type CreateShelfInput = z.infer<typeof createShelfSchema>;
export type AssignWorkInput = z.infer<typeof assignWorkSchema>;
export type ArrangementParams = z.infer<typeof arrangementParamsSchema>;
export type SaveArrangementInput = z.infer<typeof saveArrangementSchema>;
