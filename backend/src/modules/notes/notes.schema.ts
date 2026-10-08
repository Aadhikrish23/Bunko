import { z } from 'zod';

export const workIdParamsSchema = z
  .object({
    workId: z.string().uuid(),
  })
  .strict();

export const noteIdParamsSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

const NOTE_SCOPES = ['BOOK', 'CHAPTER', 'SECTION', 'PAGE', 'PASSAGE', 'SESSION'] as const;
const EDITION_SCOPED = new Set(['CHAPTER', 'SECTION', 'PAGE', 'PASSAGE']);

// SRS §13.1: a BOOK or SESSION note has no location; CHAPTER/SECTION/
// PAGE/PASSAGE do, and since that location is only meaningful within
// one specific edition's content, those scopes also need a copyId to
// say which edition it's anchored in.
export const createNoteSchema = z
  .object({
    scope: z.enum(NOTE_SCOPES),
    position: z.string().min(1).nullable().optional(),
    copyId: z.string().uuid().nullable().optional(),
    sessionId: z.string().uuid().nullable().optional(),
    body: z.string().min(1).max(10_000),
  })
  .strict()
  .refine((input) => !EDITION_SCOPED.has(input.scope) || Boolean(input.position), {
    message: 'position is required for CHAPTER, SECTION, PAGE, and PASSAGE notes',
    path: ['position'],
  })
  .refine((input) => !EDITION_SCOPED.has(input.scope) || Boolean(input.copyId), {
    message: 'copyId is required for CHAPTER, SECTION, PAGE, and PASSAGE notes',
    path: ['copyId'],
  });

export const updateNoteSchema = z
  .object({
    body: z.string().min(1).max(10_000),
  })
  .strict();

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
