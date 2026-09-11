import type { NextFunction, Request, Response } from 'express';
import { requireUserId } from '../../lib/require-user';
import { sendOk } from '../../lib/response';
import * as filesService from './files.service';
import type { RequestUploadUrlInput } from './files.schema';

export async function requestUploadUrlHandler(
  req: Request<unknown, unknown, RequestUploadUrlInput>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const dto = await filesService.requestUploadUrl(requireUserId(req), req.body);
    sendOk(res, dto);
  } catch (err) {
    next(err);
  }
}

export async function confirmUploadHandler(
  req: Request<{ fileId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const dto = await filesService.confirmUpload(requireUserId(req), req.params.fileId);
    sendOk(res, dto);
  } catch (err) {
    next(err);
  }
}
