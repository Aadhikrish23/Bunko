import type { NextFunction, Request, Response } from 'express';
import { requireUserId } from '../../lib/require-user';
import { sendOk } from '../../lib/response';
import * as notesService from './notes.service';
import type { CreateNoteInput, UpdateNoteInput } from './notes.schema';

export async function listNotesHandler(
  req: Request<{ workId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sendOk(res, await notesService.listNotes(requireUserId(req), req.params.workId));
  } catch (err) {
    next(err);
  }
}

export async function createNoteHandler(
  req: Request<{ workId: string }, unknown, CreateNoteInput>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sendOk(res, await notesService.createNote(requireUserId(req), req.params.workId, req.body), 201);
  } catch (err) {
    next(err);
  }
}

export async function updateNoteHandler(
  req: Request<{ id: string }, unknown, UpdateNoteInput>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sendOk(res, await notesService.updateNote(requireUserId(req), req.params.id, req.body));
  } catch (err) {
    next(err);
  }
}

export async function deleteNoteHandler(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await notesService.deleteNote(requireUserId(req), req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
