import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './reading-sessions.controller';
import {
  endSessionSchema,
  logSessionSchema,
  openSessionQuerySchema,
  reportProgressSchema,
  sessionIdParamsSchema,
  startSessionSchema,
} from './reading-sessions.schema';

export const readingSessionsRouter = Router();

readingSessionsRouter.post('/', authMiddleware, validate(startSessionSchema), controller.startSessionHandler);
readingSessionsRouter.post('/log', authMiddleware, validate(logSessionSchema), controller.logSessionHandler);
readingSessionsRouter.patch(
  '/:sessionId/progress',
  authMiddleware,
  validate(sessionIdParamsSchema, 'params'),
  validate(reportProgressSchema),
  controller.reportProgressHandler,
);
readingSessionsRouter.post('/pause-active', authMiddleware, controller.pauseActiveSessionHandler);
readingSessionsRouter.get('/open', authMiddleware, validate(openSessionQuerySchema, 'query'), controller.openSessionHandler);
readingSessionsRouter.post(
  '/:sessionId/pause',
  authMiddleware,
  validate(sessionIdParamsSchema, 'params'),
  controller.pauseSessionHandler,
);
readingSessionsRouter.delete(
  '/:sessionId',
  authMiddleware,
  validate(sessionIdParamsSchema, 'params'),
  controller.deleteSessionHandler,
);
readingSessionsRouter.post(
  '/:sessionId/end',
  authMiddleware,
  validate(sessionIdParamsSchema, 'params'),
  validate(endSessionSchema),
  controller.endSessionHandler,
);
