import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './soundtrack.controller';
import {
  createSoundtrackSchema,
  mappingIdParamsSchema,
  soundtrackIdParamsSchema,
  updateSoundtrackSchema,
  upsertMappingSchema,
  workIdParamsSchema,
} from './soundtrack.schema';

// Mounted at '/api/v1/soundtracks' — the caller's playlists (SRS §17.2).
export const soundtracksRouter = Router();

soundtracksRouter.get('/', authMiddleware, controller.listSoundtracksHandler);
soundtracksRouter.post('/', authMiddleware, validate(createSoundtrackSchema), controller.createSoundtrackHandler);
soundtracksRouter.patch(
  '/:id',
  authMiddleware,
  validate(soundtrackIdParamsSchema, 'params'),
  validate(updateSoundtrackSchema),
  controller.updateSoundtrackHandler,
);
soundtracksRouter.delete(
  '/:id',
  authMiddleware,
  validate(soundtrackIdParamsSchema, 'params'),
  controller.deleteSoundtrackHandler,
);

// Mounted at '/api/v1/soundtrack-mappings' — playlist ↔ book/shelf/genre/
// mood/situation associations. PUT upserts by target (one per target).
export const soundtrackMappingsRouter = Router();

soundtrackMappingsRouter.put('/', authMiddleware, validate(upsertMappingSchema), controller.upsertMappingHandler);
soundtrackMappingsRouter.delete(
  '/:id',
  authMiddleware,
  validate(mappingIdParamsSchema, 'params'),
  controller.deleteMappingHandler,
);

// Mounted at '/api/v1/works' — what automatic mode plays for a book (T-061).
export const soundtrackForWorkRouter = Router();

soundtrackForWorkRouter.get(
  '/:workId/soundtrack',
  authMiddleware,
  validate(workIdParamsSchema, 'params'),
  controller.resolveForWorkHandler,
);
