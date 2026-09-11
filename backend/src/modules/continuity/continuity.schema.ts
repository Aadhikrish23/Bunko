import { z } from 'zod';

export const journeyIdParamsSchema = z
  .object({
    journeyId: z.string().uuid(),
  })
  .strict();

export const resolvePositionSchema = z
  .object({
    targetEditionId: z.string().uuid(),
  })
  .strict();

export const correctPositionSchema = z
  .object({
    structuralId: z.string().min(1).nullable().optional(),
    chapterLabel: z.string().min(1).nullable().optional(),
    pageNumber: z.number().int().positive().nullable().optional(),
  })
  .strict();

export type ResolvePositionInput = z.infer<typeof resolvePositionSchema>;
export type CorrectPositionInput = z.infer<typeof correctPositionSchema>;
