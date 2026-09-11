import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './shelves.controller';
import { assignWorkSchema, createShelfSchema, shelfIdParamsSchema, shelfWorkParamsSchema } from './shelves.schema';

export const shelvesRouter = Router();

shelvesRouter.get('/', authMiddleware, controller.listShelvesHandler);
shelvesRouter.post('/', authMiddleware, validate(createShelfSchema), controller.createShelfHandler);
shelvesRouter.delete(
  '/:shelfId',
  authMiddleware,
  validate(shelfIdParamsSchema, 'params'),
  controller.deleteShelfHandler,
);
shelvesRouter.post(
  '/:shelfId/works',
  authMiddleware,
  validate(shelfIdParamsSchema, 'params'),
  validate(assignWorkSchema),
  controller.assignWorkHandler,
);
shelvesRouter.delete(
  '/:shelfId/works/:workId',
  authMiddleware,
  validate(shelfWorkParamsSchema, 'params'),
  controller.removeWorkHandler,
);
