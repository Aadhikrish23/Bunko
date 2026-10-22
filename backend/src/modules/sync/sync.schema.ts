import { z } from 'zod';
import { createAnnotationSchema, updateAnnotationSchema } from '../annotations/annotations.schema';
import { createBookmarkSchema } from '../bookmarks/bookmarks.schema';
import { createNoteSchema, updateNoteSchema } from '../notes/notes.schema';
import { PREFERENCE_KEYS, preferenceValueSchema } from '../preferences/preferences.schema';

const uuid = z.string().uuid();
const iso = z.string().datetime();

export const SYNC_EVENT_TYPES = [
  'SESSION_RECORDED',
  'ANNOTATION_CREATED',
  'ANNOTATION_UPDATED',
  'ANNOTATION_DELETED',
  'NOTE_CREATED',
  'NOTE_UPDATED',
  'NOTE_DELETED',
  'BOOKMARK_CREATED',
  'BOOKMARK_DELETED',
  'PREFERENCE_SET',
] as const;

export const registerDeviceSchema = z
  .object({ deviceId: uuid, label: z.string().trim().min(1).max(80) })
  .strict();

// The envelope only — each payload is validated against its own type's
// schema during ingestion, so one malformed event is REJECTED on its own
// instead of failing the whole batch.
export const syncEventsSchema = z
  .object({
    events: z
      .array(
        z
          .object({
            id: uuid,
            type: z.enum(SYNC_EVENT_TYPES),
            createdAt: iso,
            payload: z.record(z.string(), z.unknown()),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();

export const conflictIdParamsSchema = z.object({ id: uuid }).strict();
export const resolveConflictSchema = z.object({ keep: z.enum(['SERVER', 'DEVICE']) }).strict();

// Per-type payloads reuse the online endpoints' schemas so offline writes
// are held to exactly the same validation (T-069).
const position = z.string().min(1).max(500);
export const payloadSchemas = {
  SESSION_RECORDED: z
    .object({
      sessionId: uuid,
      copyId: uuid,
      startTime: iso,
      endTime: iso,
      startPosition: position.nullable().optional(),
      endPosition: position.nullable().optional(),
      reflection: z.string().max(5_000).nullable().optional(),
    })
    .strict(),
  ANNOTATION_CREATED: createAnnotationSchema.extend({ annotationId: uuid, editionId: uuid }),
  ANNOTATION_UPDATED: updateAnnotationSchema.extend({ annotationId: uuid }),
  ANNOTATION_DELETED: z.object({ annotationId: uuid }).strict(),
  // createNoteSchema is refined (scope-dependent fields), so the ids are
  // split off and the rest is checked with it as-is.
  NOTE_CREATED_IDS: z.object({ noteId: uuid, workId: uuid }).passthrough(),
  NOTE_CREATED: createNoteSchema,
  NOTE_UPDATED: updateNoteSchema.extend({ noteId: uuid }),
  NOTE_DELETED: z.object({ noteId: uuid }).strict(),
  BOOKMARK_CREATED: createBookmarkSchema.omit({ id: true }).extend({ bookmarkId: uuid, editionId: uuid }),
  BOOKMARK_DELETED: z.object({ bookmarkId: uuid }).strict(),
  PREFERENCE_SET: z.object({ key: z.enum(PREFERENCE_KEYS), value: preferenceValueSchema }).strict(),
};

export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;
export type SyncEventsInput = z.infer<typeof syncEventsSchema>;
export type SyncEventInput = SyncEventsInput['events'][number];
export type ResolveConflictInput = z.infer<typeof resolveConflictSchema>;
