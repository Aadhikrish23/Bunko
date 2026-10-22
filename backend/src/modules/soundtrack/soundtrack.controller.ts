import type { NextFunction, Request, Response } from 'express';
import { requireUserId } from '../../lib/require-user';
import { sendOk } from '../../lib/response';
import * as soundtrackService from './soundtrack.service';
import type { CreateSoundtrackInput, UpdateSoundtrackInput, UpsertMappingInput } from './soundtrack.schema';

type Handler<P = Record<string, string>, B = unknown> = (
  req: Request<P, unknown, B>,
  res: Response,
  next: NextFunction,
) => Promise<void>;

export const listSoundtracksHandler: Handler = async (req, res, next) => {
  try {
    sendOk(res, await soundtrackService.listSoundtracks(requireUserId(req)));
  } catch (err) {
    next(err);
  }
};

export const createSoundtrackHandler: Handler<Record<string, string>, CreateSoundtrackInput> = async (req, res, next) => {
  try {
    sendOk(res, await soundtrackService.createSoundtrack(requireUserId(req), req.body), 201);
  } catch (err) {
    next(err);
  }
};

export const updateSoundtrackHandler: Handler<{ id: string }, UpdateSoundtrackInput> = async (req, res, next) => {
  try {
    sendOk(res, await soundtrackService.updateSoundtrack(requireUserId(req), req.params.id, req.body));
  } catch (err) {
    next(err);
  }
};

export const deleteSoundtrackHandler: Handler<{ id: string }> = async (req, res, next) => {
  try {
    await soundtrackService.deleteSoundtrack(requireUserId(req), req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const upsertMappingHandler: Handler<Record<string, string>, UpsertMappingInput> = async (req, res, next) => {
  try {
    sendOk(res, await soundtrackService.upsertMapping(requireUserId(req), req.body));
  } catch (err) {
    next(err);
  }
};

export const deleteMappingHandler: Handler<{ id: string }> = async (req, res, next) => {
  try {
    await soundtrackService.deleteMapping(requireUserId(req), req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const resolveForWorkHandler: Handler<{ workId: string }> = async (req, res, next) => {
  try {
    sendOk(res, await soundtrackService.resolveForWork(requireUserId(req), req.params.workId));
  } catch (err) {
    next(err);
  }
};
