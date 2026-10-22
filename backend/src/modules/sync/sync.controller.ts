import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../../lib/app-error';
import { requestDeviceId } from '../../lib/device-id';
import { requireUserId } from '../../lib/require-user';
import { sendOk } from '../../lib/response';
import * as syncService from './sync.service';
import type { RegisterDeviceInput, ResolveConflictInput, SyncEventsInput } from './sync.schema';

export async function registerDeviceHandler(
  req: Request<unknown, unknown, RegisterDeviceInput>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sendOk(res, await syncService.registerDevice(requireUserId(req), req.body.deviceId.toLowerCase(), req.body.label));
  } catch (err) {
    next(err);
  }
}

export async function listDevicesHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendOk(res, await syncService.listDevices(requireUserId(req), requestDeviceId(req)));
  } catch (err) {
    next(err);
  }
}

// Offline events need a device to attribute them to (conflict detection
// depends on it), so unlike other endpoints X-Device-Id is required here.
export async function ingestEventsHandler(
  req: Request<unknown, unknown, SyncEventsInput>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const deviceId = requestDeviceId(req);
    if (!deviceId) throw new AppError('VALIDATION_ERROR', 'X-Device-Id header (a UUID) is required to sync');
    sendOk(res, await syncService.ingestEvents(requireUserId(req), deviceId, req.body.events));
  } catch (err) {
    next(err);
  }
}

export async function listConflictsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendOk(res, await syncService.listConflicts(requireUserId(req)));
  } catch (err) {
    next(err);
  }
}

export async function resolveConflictHandler(
  req: Request<{ id: string }, unknown, ResolveConflictInput>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await syncService.resolveConflict(requireUserId(req), req.params.id, req.body.keep);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
