import type { NextFunction, Request, Response } from 'express';
import { requireUserId } from '../../lib/require-user';
import { sendOk } from '../../lib/response';
import * as editionsService from './editions.service';
import type { CreateCopyInput, CreateEditionInput } from './editions.schema';

export async function createEditionHandler(
  req: Request<unknown, unknown, CreateEditionInput>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const dto = await editionsService.createEdition(requireUserId(req), req.body);
    sendOk(res, dto, 201);
  } catch (err) {
    next(err);
  }
}

export async function createCopyHandler(
  req: Request<unknown, unknown, CreateCopyInput>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const dto = await editionsService.createCopy(requireUserId(req), req.body);
    sendOk(res, dto, 201);
  } catch (err) {
    next(err);
  }
}
