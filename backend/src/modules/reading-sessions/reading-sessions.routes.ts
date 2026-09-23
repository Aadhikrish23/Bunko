import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './reading-sessions.controller';
import {
  endSessionSchema,
  reportProgressSchema,
  sessionIdParamsSchema,
  startSessionSchema,
} from './reading-sessions.schema';

export const readingSessionsRouter = Router();

readingSessionsRouter.post('/', authMiddleware, validate(startSessionSchema), controller.startSessionHandler);
readingSessionsRouter.patch(
  '/:sessionId/progress',
  authMiddleware,
  validate(sessionIdParamsSchema, 'params'),
  validate(reportProgressSchema),
  controller.reportProgressHandler,
);
readingSessionsRouter.post('/pause-active', authMiddleware, controller.pauseActiveSessionHandler);
readingSessionsRouter.post(
  '/:sessionId/pause',
  authMiddleware,
  validate(sessionIdParamsSchema, 'params'),
  controller.pauseSessionHandler,
);
readingSessionsRouter.post(
  '/:sessionId/end',
  authMiddleware,
  validate(sessionIdParamsSchema, 'params'),
  validate(endSessionSchema),
  controller.endSessionHandler,
);
