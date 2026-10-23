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

// A finished session logged after the fact (SRS §6.3 manual override): "read 40 min last
// night, pages 80 to 112".
export const logSessionSchema = z
  .object({
    copyId: z.string().uuid(),
    endedAt: z.coerce.date().optional(),
    minutes: z.number().int().min(1).max(720),
    startPosition: z.string().trim().min(1).max(200).nullable().optional(),
    endPosition: z.string().trim().min(1).max(200).nullable().optional(),
    reflection: z.string().max(5_000).nullable().optional(),
  })
  .strict();

export type LogSessionInput = z.infer<typeof logSessionSchema>;
