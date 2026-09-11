import type { NextFunction, Request, Response } from 'express';
import { requireUserId } from '../../lib/require-user';
import { sendOk } from '../../lib/response';
import * as continuityService from './continuity.service';
import type { CorrectPositionInput, ResolvePositionInput } from './continuity.schema';

export async function resolvePositionHandler(
  req: Request<{ journeyId: string }, unknown, ResolvePositionInput>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const dto = await continuityService.resolvePosition(
      requireUserId(req),
      req.params.journeyId,
      req.body.targetEditionId,
    );
    sendOk(res, dto);
  } catch (err) {
    next(err);
  }
}

export async function correctPositionHandler(
  req: Request<{ journeyId: string }, unknown, CorrectPositionInput>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await continuityService.correctPosition(requireUserId(req), req.params.journeyId, req.body);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
