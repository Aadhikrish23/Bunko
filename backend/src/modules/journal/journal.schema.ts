import { z } from 'zod';

export const listJournalQuerySchema = z
  .object({
    workId: z.string().uuid().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type ListJournalQuery = z.infer<typeof listJournalQuerySchema>;
