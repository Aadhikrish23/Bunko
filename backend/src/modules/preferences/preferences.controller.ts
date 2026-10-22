import type { NextFunction, Request, Response } from 'express';
import { requestDeviceId } from '../../lib/device-id';
import { requireUserId } from '../../lib/require-user';
import { sendOk } from '../../lib/response';
import * as preferencesService from './preferences.service';
import type { PreferenceKey, SetPreferenceInput } from './preferences.schema';

export async function listPreferencesHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendOk(res, await preferencesService.listPreferences(requireUserId(req)));
  } catch (err) {
    next(err);
  }
}

// Always 200 with `applied` — an older write losing to a newer one is the
// rule working, not an error.
export async function setPreferenceHandler(
  req: Request<{ key: PreferenceKey }, unknown, SetPreferenceInput>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { preference, applied } = await preferencesService.setPreference(
      requireUserId(req),
      req.params.key,
      req.body.value,
      new Date(req.body.updatedAt),
      requestDeviceId(req),
    );
    sendOk(res, { ...preference, applied });
  } catch (err) {
    next(err);
  }
}
