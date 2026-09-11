import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { correctPositionHandler, resolvePositionHandler } from './continuity.controller';
import { correctPositionSchema, journeyIdParamsSchema, resolvePositionSchema } from './continuity.schema';

export const continuityRouter = Router();

continuityRouter.post(
  '/:journeyId/resolve-position',
  authMiddleware,
  validate(journeyIdParamsSchema, 'params'),
  validate(resolvePositionSchema),
  resolvePositionHandler,
);
continuityRouter.post(
  '/:journeyId/position',
  authMiddleware,
  validate(journeyIdParamsSchema, 'params'),
  validate(correctPositionSchema),
  correctPositionHandler,
);
