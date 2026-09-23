import type { NextFunction, Request, Response } from 'express';
import { requireUserId } from '../../lib/require-user';
import { sendOk } from '../../lib/response';
import * as sessionsService from './reading-sessions.service';
import type { EndSessionInput, ReportProgressInput, StartSessionInput } from './reading-sessions.schema';

export async function startSessionHandler(
  req: Request<unknown, unknown, StartSessionInput>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const dto = await sessionsService.startSession(requireUserId(req), req.body);
    sendOk(res, dto, 201);
  } catch (err) {
    next(err);
  }
}

export async function reportProgressHandler(
  req: Request<{ sessionId: string }, unknown, ReportProgressInput>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await sessionsService.reportProgress(requireUserId(req), req.params.sessionId, req.body);
    sendOk(res, { recorded: true });
  } catch (err) {
    next(err);
  }
}

export async function pauseSessionHandler(
  req: Request<{ sessionId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const dto = await sessionsService.pauseSession(requireUserId(req), req.params.sessionId);
    sendOk(res, dto);
  } catch (err) {
    next(err);
  }
}

export async function pauseActiveSessionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const dto = await sessionsService.pauseActiveSession(requireUserId(req));
    sendOk(res, dto);
  } catch (err) {
    next(err);
  }
}

export async function endSessionHandler(
  req: Request<{ sessionId: string }, unknown, EndSessionInput>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const dto = await sessionsService.endSession(requireUserId(req), req.params.sessionId, req.body);
    sendOk(res, dto);
  } catch (err) {
    next(err);
  }
}
