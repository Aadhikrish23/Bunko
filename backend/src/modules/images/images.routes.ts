import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { confirmImageUploadHandler, requestImageUploadUrlHandler } from './images.controller';
import { imageIdParamsSchema, requestImageUploadUrlSchema } from './images.schema';

export const imagesRouter = Router();

imagesRouter.post('/upload-url', authMiddleware, validate(requestImageUploadUrlSchema), requestImageUploadUrlHandler);
imagesRouter.post(
  '/:imageId/confirm',
  authMiddleware,
  validate(imageIdParamsSchema, 'params'),
  confirmImageUploadHandler,
);
