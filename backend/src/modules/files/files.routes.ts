import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { confirmUploadHandler, requestUploadUrlHandler } from './files.controller';
import { fileIdParamsSchema, requestUploadUrlSchema } from './files.schema';

export const filesRouter = Router();

filesRouter.post('/upload-url', authMiddleware, validate(requestUploadUrlSchema), requestUploadUrlHandler);
filesRouter.post(
  '/:fileId/confirm',
  authMiddleware,
  validate(fileIdParamsSchema, 'params'),
  confirmUploadHandler,
);
