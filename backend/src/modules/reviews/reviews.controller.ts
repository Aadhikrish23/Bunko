import type { NextFunction, Request, Response } from 'express';
import { requireUserId } from '../../lib/require-user';
import { sendOk } from '../../lib/response';
import * as reviewsService from './reviews.service';
import type { UpdateReviewInput, UpsertReviewInput } from './reviews.schema';

export async function getOwnReviewHandler(
  req: Request<{ workId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sendOk(res, await reviewsService.getOwnReview(requireUserId(req), req.params.workId));
  } catch (err) {
    next(err);
  }
}

export async function upsertReviewHandler(
  req: Request<{ workId: string }, unknown, UpsertReviewInput>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sendOk(res, await reviewsService.upsertReview(requireUserId(req), req.params.workId, req.body));
  } catch (err) {
    next(err);
  }
}

export async function updateReviewHandler(
  req: Request<{ workId: string }, unknown, UpdateReviewInput>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sendOk(res, await reviewsService.updateReview(requireUserId(req), req.params.workId, req.body));
  } catch (err) {
    next(err);
  }
}

export async function deleteReviewHandler(
  req: Request<{ workId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await reviewsService.deleteReview(requireUserId(req), req.params.workId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
