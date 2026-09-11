import type { NextFunction, Request, Response } from 'express';
import { requireUserId } from '../../lib/require-user';
import { sendOk } from '../../lib/response';
import * as usersService from './users.service';
import type { UpdateProfileInput } from './users.schema';

export async function getMeHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profile = await usersService.getProfile(requireUserId(req));
    sendOk(res, profile);
  } catch (err) {
    next(err);
  }
}

export async function updateMeHandler(
  req: Request<unknown, unknown, UpdateProfileInput>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const profile = await usersService.updateProfile(requireUserId(req), req.body);
    sendOk(res, profile);
  } catch (err) {
    next(err);
  }
}
