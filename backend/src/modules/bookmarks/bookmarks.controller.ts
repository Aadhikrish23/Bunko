import type { NextFunction, Request, Response } from 'express';
import { requireUserId } from '../../lib/require-user';
import { sendOk } from '../../lib/response';
import * as bookmarksService from './bookmarks.service';
import type { CreateBookmarkInput } from './bookmarks.schema';

export async function listBookmarksHandler(
  req: Request<{ editionId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sendOk(res, await bookmarksService.listBookmarks(requireUserId(req), req.params.editionId));
  } catch (err) {
    next(err);
  }
}

export async function createBookmarkHandler(
  req: Request<{ editionId: string }, unknown, CreateBookmarkInput>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { bookmark, created } = await bookmarksService.createBookmark(
      requireUserId(req),
      req.params.editionId,
      req.body,
    );
    sendOk(res, bookmark, created ? 201 : 200);
  } catch (err) {
    next(err);
  }
}

export async function deleteBookmarkHandler(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    await bookmarksService.deleteBookmark(requireUserId(req), req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
