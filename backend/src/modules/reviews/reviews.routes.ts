import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './reviews.controller';
import { updateReviewSchema, upsertReviewSchema, workIdParamsSchema } from './reviews.schema';

// Mounted at the same base path as worksRouter ('/api/v1/works') — same
// pattern as notes.routes.ts. One review per (userId, workId), so the
// path is singular ("review", not "reviews/:id") and has no list route.
export const reviewsRouter = Router();

reviewsRouter.get(
  '/:workId/review',
  authMiddleware,
  validate(workIdParamsSchema, 'params'),
  controller.getOwnReviewHandler,
);

reviewsRouter.put(
  '/:workId/review',
  authMiddleware,
  validate(workIdParamsSchema, 'params'),
  validate(upsertReviewSchema),
  controller.upsertReviewHandler,
);

reviewsRouter.patch(
  '/:workId/review',
  authMiddleware,
  validate(workIdParamsSchema, 'params'),
  validate(updateReviewSchema),
  controller.updateReviewHandler,
);

reviewsRouter.delete(
  '/:workId/review',
  authMiddleware,
  validate(workIdParamsSchema, 'params'),
  controller.deleteReviewHandler,
);
