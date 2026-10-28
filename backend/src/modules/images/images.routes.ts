import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { confirmImageUploadHandler, processImageHandler, requestImageUploadUrlHandler } from './images.controller';
import { imageIdParamsSchema, processImageSchema, requestImageUploadUrlSchema } from './images.schema';

export const imagesRouter = Router();

imagesRouter.post('/upload-url', authMiddleware, validate(requestImageUploadUrlSchema), requestImageUploadUrlHandler);
imagesRouter.post(
  '/:imageId/confirm',
  authMiddleware,
  validate(imageIdParamsSchema, 'params'),
  confirmImageUploadHandler,
);
imagesRouter.post(
  '/:imageId/process',
  authMiddleware,
  validate(imageIdParamsSchema, 'params'),
  validate(processImageSchema),
  processImageHandler,
);
