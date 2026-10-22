import { z } from 'zod';

export const soundtrackIdParamsSchema = z.object({ id: z.string().uuid() }).strict();
export const mappingIdParamsSchema = z.object({ id: z.string().uuid() }).strict();
export const workIdParamsSchema = z.object({ workId: z.string().uuid() }).strict();

const name = z.string().trim().min(1).max(80);
// Provider/host checks live in providers.ts (T-058); this only bounds size.
const url = z.string().trim().min(1).max(2048);

export const createSoundtrackSchema = z.object({ name, url }).strict();

export const updateSoundtrackSchema = z
  .object({ name: name.optional(), url: url.optional() })
  .strict()
  .refine((input) => input.name !== undefined || input.url !== undefined, {
    message: 'Provide a name or url to update',
  });

const TARGET_TYPES = ['WORK', 'SHELF', 'GENRE', 'MOOD', 'SITUATION'] as const;
const ID_TARGETS = new Set(['WORK', 'SHELF']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const upsertMappingSchema = z
  .object({
    soundtrackId: z.string().uuid(),
    targetType: z.enum(TARGET_TYPES),
    targetKey: z.string().trim().min(1).max(60),
  })
  .strict()
  .refine((input) => !ID_TARGETS.has(input.targetType) || UUID.test(input.targetKey), {
    message: 'targetKey must be a workId/shelfId for WORK and SHELF targets',
    path: ['targetKey'],
  });

export type CreateSoundtrackInput = z.infer<typeof createSoundtrackSchema>;
export type UpdateSoundtrackInput = z.infer<typeof updateSoundtrackSchema>;
export type UpsertMappingInput = z.infer<typeof upsertMappingSchema>;
