import type { NextFunction, Request, Response } from 'express';
import { requireUserId } from '../../lib/require-user';
import { sendOk } from '../../lib/response';
import * as annotationsService from './annotations.service';
import { searchAnnotationsAndNotes } from './search.service';
import type { CreateAnnotationInput, SearchAnnotationsQuery, UpdateAnnotationInput } from './annotations.schema';

export async function listAnnotationsHandler(
  req: Request<{ editionId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sendOk(res, await annotationsService.listAnnotations(requireUserId(req), req.params.editionId));
  } catch (err) {
    next(err);
  }
}

export async function createAnnotationHandler(
  req: Request<{ editionId: string }, unknown, CreateAnnotationInput>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sendOk(res, await annotationsService.createAnnotation(requireUserId(req), req.params.editionId, req.body), 201);
  } catch (err) {
    next(err);
  }
}

export async function updateAnnotationHandler(
  req: Request<{ id: string }, unknown, UpdateAnnotationInput>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sendOk(res, await annotationsService.updateAnnotation(requireUserId(req), req.params.id, req.body));
  } catch (err) {
    next(err);
  }
}

export async function searchAnnotationsHandler(
  req: Request<unknown, unknown, unknown, SearchAnnotationsQuery>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sendOk(res, await searchAnnotationsAndNotes(requireUserId(req), req.query.q));
  } catch (err) {
    next(err);
  }
}

export async function deleteAnnotationHandler(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await annotationsService.deleteAnnotation(requireUserId(req), req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
