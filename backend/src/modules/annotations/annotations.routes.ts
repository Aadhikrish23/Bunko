import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './annotations.controller';
import {
  annotationIdParamsSchema,
  createAnnotationSchema,
  editionIdParamsSchema,
  searchAnnotationsSchema,
  updateAnnotationSchema,
} from './annotations.schema';

// Mounted at the same base path as editionsRouter/readerRouter
// ('/api/v1/editions') — same pattern as reader.routes.ts.
export const annotationsForEditionRouter = Router();

annotationsForEditionRouter.get(
  '/:editionId/annotations',
  authMiddleware,
  validate(editionIdParamsSchema, 'params'),
  controller.listAnnotationsHandler,
);

annotationsForEditionRouter.post(
  '/:editionId/annotations',
  authMiddleware,
  validate(editionIdParamsSchema, 'params'),
  validate(createAnnotationSchema),
  controller.createAnnotationHandler,
);

// Mounted at '/api/v1/annotations' — an annotation's own id is already
// globally unique, so these don't need the editionId prefix.
export const annotationsRouter = Router();

// Registered before '/:id' so "search" is never swallowed as an :id
// value — harmless here since GET has no :id route to collide with,
// but keeping literal-before-param order is the clearer convention.
annotationsRouter.get(
  '/search',
  authMiddleware,
  validate(searchAnnotationsSchema, 'query'),
  controller.searchAnnotationsHandler,
);

annotationsRouter.patch(
  '/:id',
  authMiddleware,
  validate(annotationIdParamsSchema, 'params'),
  validate(updateAnnotationSchema),
  controller.updateAnnotationHandler,
);

annotationsRouter.delete(
  '/:id',
  authMiddleware,
  validate(annotationIdParamsSchema, 'params'),
  controller.deleteAnnotationHandler,
);
