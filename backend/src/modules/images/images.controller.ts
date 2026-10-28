import type { NextFunction, Request, Response } from 'express';
import { requireUserId } from '../../lib/require-user';
import { sendOk } from '../../lib/response';
import * as imagesService from './images.service';
import type { ProcessImageInput, RequestImageUploadUrlInput } from './images.schema';

export async function requestImageUploadUrlHandler(
  req: Request<unknown, unknown, RequestImageUploadUrlInput>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const dto = await imagesService.requestImageUploadUrl(requireUserId(req), req.body);
    sendOk(res, dto);
  } catch (err) {
    next(err);
  }
}

export async function confirmImageUploadHandler(
  req: Request<{ imageId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const dto = await imagesService.confirmImageUpload(requireUserId(req), req.params.imageId);
    sendOk(res, dto);
  } catch (err) {
    next(err);
  }
}

export async function processImageHandler(
  req: Request<{ imageId: string }, unknown, ProcessImageInput>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const dto = await imagesService.processImage(requireUserId(req), req.params.imageId, req.body);
    sendOk(res, dto);
  } catch (err) {
    next(err);
  }
}
