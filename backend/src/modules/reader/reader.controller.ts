import type { NextFunction, Request, Response } from 'express';
import { requireUserId } from '../../lib/require-user';
import { sendOk } from '../../lib/response';
import * as readerService from './reader.service';

export async function getReaderManifestHandler(
  req: Request<{ editionId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const dto = await readerService.getReaderManifest(requireUserId(req), req.params.editionId);
    sendOk(res, dto);
  } catch (err) {
    next(err);
  }
}

export async function getChaptersHandler(
  req: Request<{ editionId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const dto = await readerService.getChapters(requireUserId(req), req.params.editionId);
    sendOk(res, dto);
  } catch (err) {
    next(err);
  }
}
