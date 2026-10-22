import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { listPreferencesHandler, setPreferenceHandler } from './preferences.controller';
import { preferenceKeyParamsSchema, setPreferenceSchema } from './preferences.schema';

// Mounted at '/api/v1/preferences'.
export const preferencesRouter = Router();

preferencesRouter.get('/', authMiddleware, listPreferencesHandler);

preferencesRouter.put(
  '/:key',
  authMiddleware,
  validate(preferenceKeyParamsSchema, 'params'),
  validate(setPreferenceSchema),
  setPreferenceHandler,
);
