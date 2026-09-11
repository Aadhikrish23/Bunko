import { z } from 'zod';

export const startSessionSchema = z
  .object({
    copyId: z.string().uuid(),
    startPosition: z.string().min(1).nullable().optional(),
  })
  .strict();

export const reportProgressSchema = z
  .object({
    position: z.string().min(1),
  })
  .strict();

export const endSessionSchema = z
  .object({
    endPosition: z.string().min(1).optional(),
    reflection: z.string().nullable().optional(),
  })
  .strict();

export const sessionIdParamsSchema = z
  .object({
    sessionId: z.string().uuid(),
  })
  .strict();

export type StartSessionInput = z.infer<typeof startSessionSchema>;
export type ReportProgressInput = z.infer<typeof reportProgressSchema>;
export type EndSessionInput = z.infer<typeof endSessionSchema>;
