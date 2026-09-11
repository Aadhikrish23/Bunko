import type { NextFunction, Request, Response } from 'express';
import { requireUserId } from '../../lib/require-user';
import { sendOk } from '../../lib/response';
import * as shelvesService from './shelves.service';
import type { AssignWorkInput, CreateShelfInput } from './shelves.schema';

export async function listShelvesHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendOk(res, await shelvesService.listShelves(requireUserId(req)));
  } catch (err) {
    next(err);
  }
}

export async function createShelfHandler(
  req: Request<unknown, unknown, CreateShelfInput>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sendOk(res, await shelvesService.createShelf(requireUserId(req), req.body), 201);
  } catch (err) {
    next(err);
  }
}

export async function deleteShelfHandler(
  req: Request<{ shelfId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await shelvesService.deleteShelf(requireUserId(req), req.params.shelfId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function assignWorkHandler(
  req: Request<{ shelfId: string }, unknown, AssignWorkInput>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await shelvesService.assignWorkToShelf(requireUserId(req), req.params.shelfId, req.body);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function removeWorkHandler(
  req: Request<{ shelfId: string; workId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await shelvesService.removeWorkFromShelf(requireUserId(req), req.params.shelfId, req.params.workId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
