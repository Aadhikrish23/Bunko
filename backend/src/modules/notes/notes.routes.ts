import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './notes.controller';
import { createNoteSchema, noteIdParamsSchema, updateNoteSchema, workIdParamsSchema } from './notes.schema';

// Mounted at the same base path as worksRouter ('/api/v1/works') — same
// pattern as reader.routes.ts / annotations.routes.ts.
export const notesForWorkRouter = Router();

notesForWorkRouter.get(
  '/:workId/notes',
  authMiddleware,
  validate(workIdParamsSchema, 'params'),
  controller.listNotesHandler,
);

notesForWorkRouter.post(
  '/:workId/notes',
  authMiddleware,
  validate(workIdParamsSchema, 'params'),
  validate(createNoteSchema),
  controller.createNoteHandler,
);

// Mounted at '/api/v1/notes' — a note's own id is already globally
// unique, so these don't need the workId prefix.
export const notesRouter = Router();

notesRouter.patch(
  '/:id',
  authMiddleware,
  validate(noteIdParamsSchema, 'params'),
  validate(updateNoteSchema),
  controller.updateNoteHandler,
);

notesRouter.delete('/:id', authMiddleware, validate(noteIdParamsSchema, 'params'), controller.deleteNoteHandler);
