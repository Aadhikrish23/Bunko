import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './bookmarks.controller';
import { bookmarkIdParamsSchema, createBookmarkSchema, editionIdParamsSchema } from './bookmarks.schema';

// Mounted at '/api/v1/editions' — same pattern as annotations.routes.ts.
export const bookmarksForEditionRouter = Router();

bookmarksForEditionRouter.get(
  '/:editionId/bookmarks',
  authMiddleware,
  validate(editionIdParamsSchema, 'params'),
  controller.listBookmarksHandler,
);

bookmarksForEditionRouter.post(
  '/:editionId/bookmarks',
  authMiddleware,
  validate(editionIdParamsSchema, 'params'),
  validate(createBookmarkSchema),
  controller.createBookmarkHandler,
);

// Mounted at '/api/v1/bookmarks'.
export const bookmarksRouter = Router();

bookmarksRouter.delete(
  '/:id',
  authMiddleware,
  validate(bookmarkIdParamsSchema, 'params'),
  controller.deleteBookmarkHandler,
);
