import type { NextFunction, Request, Response } from 'express';
import { requireUserId } from '../../lib/require-user';
import { sendOk, sendPaginated } from '../../lib/response';
import * as libraryService from './library.service';
import type { CreateWorkInput, ListWorksQuery, UpdateWorkInput } from './library.schema';

export async function listWorksHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.query as unknown as ListWorksQuery;
    const { items, total } = await libraryService.listWorks(requireUserId(req), query);
    sendPaginated(res, items, { page: query.page, pageSize: query.pageSize, total });
  } catch (err) {
    next(err);
  }
}

export async function createWorkHandler(
  req: Request<unknown, unknown, CreateWorkInput>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { dto, alreadyInLibrary } = await libraryService.createWork(requireUserId(req), req.body);
    sendOk(res, dto, alreadyInLibrary ? 200 : 201);
  } catch (err) {
    next(err);
  }
}

export async function getWorkHandler(req: Request<{ workId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = await libraryService.getWork(requireUserId(req), req.params.workId);
    sendOk(res, dto);
  } catch (err) {
    next(err);
  }
}

export async function updateWorkHandler(
  req: Request<{ workId: string }, unknown, UpdateWorkInput>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const dto = await libraryService.updateWork(requireUserId(req), req.params.workId, req.body);
    sendOk(res, dto);
  } catch (err) {
    next(err);
  }
}

export async function deleteWorkHandler(
  req: Request<{ workId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await libraryService.deleteWork(requireUserId(req), req.params.workId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
