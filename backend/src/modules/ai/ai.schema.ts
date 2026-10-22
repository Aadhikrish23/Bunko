import { z } from 'zod';

export const consentSchema = z
  .object({
    semanticSearch: z.boolean(),
    generative: z.boolean(),
  })
  .strict()
  .refine((input) => !input.generative || input.semanticSearch, {
    message: 'Generated insights retrieve your notes through semantic search, so it must be on too',
    path: ['generative'],
  });

export const searchQuerySchema = z.object({ q: z.string().trim().min(1).max(200) }).strict();
export const askSchema = z.object({ question: z.string().trim().min(1).max(1_000) }).strict();
export const workIdParamsSchema = z.object({ workId: z.string().uuid() }).strict();

export type ConsentInput = z.infer<typeof consentSchema>;
export type SearchQuery = z.infer<typeof searchQuerySchema>;
export type AskInput = z.infer<typeof askSchema>;
