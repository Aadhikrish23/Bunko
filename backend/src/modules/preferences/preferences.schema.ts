import { z } from 'zod';

// Only preferences Bunko actually has (T-068): the reader's appearance
// settings and the soundtrack's mode/volume/manual choice. The soundtrack
// on/off switch is device state and deliberately not here (ARCHITECTURE.md §13).
export const PREFERENCE_KEYS = ['reader-settings', 'soundtrack'] as const;
export type PreferenceKey = (typeof PREFERENCE_KEYS)[number];

const MAX_VALUE_BYTES = 4_096;

export const preferenceValueSchema = z
  .record(z.string(), z.unknown())
  .refine((value) => JSON.stringify(value).length <= MAX_VALUE_BYTES, {
    message: `Preference values are limited to ${MAX_VALUE_BYTES} bytes`,
  });

export const preferenceKeyParamsSchema = z.object({ key: z.enum(PREFERENCE_KEYS) }).strict();

export const setPreferenceSchema = z
  .object({
    value: preferenceValueSchema,
    // When the change was made on the client — what last-write-wins
    // compares, so a late-arriving older edit can't overwrite a newer one.
    updatedAt: z.string().datetime(),
  })
  .strict();

export type SetPreferenceInput = z.infer<typeof setPreferenceSchema>;
