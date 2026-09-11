import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './library.controller';
import { createWorkSchema, listWorksQuerySchema, updateWorkSchema, workIdParamsSchema } from './library.schema';

export const worksRouter = Router();

worksRouter.get('/', authMiddleware, validate(listWorksQuerySchema, 'query'), controller.listWorksHandler);
worksRouter.post('/', authMiddleware, validate(createWorkSchema), controller.createWorkHandler);
worksRouter.get('/:workId', authMiddleware, validate(workIdParamsSchema, 'params'), controller.getWorkHandler);
worksRouter.patch(
  '/:workId',
  authMiddleware,
  validate(workIdParamsSchema, 'params'),
  validate(updateWorkSchema),
  controller.updateWorkHandler,
);
worksRouter.delete('/:workId', authMiddleware, validate(workIdParamsSchema, 'params'), controller.deleteWorkHandler);
