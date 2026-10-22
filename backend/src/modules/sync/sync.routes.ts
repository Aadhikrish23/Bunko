import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './sync.controller';
import { conflictIdParamsSchema, registerDeviceSchema, resolveConflictSchema, syncEventsSchema } from './sync.schema';

// Mounted at '/api/v1/sync' (SRS §21, §28.3).
export const syncRouter = Router();

syncRouter.get('/devices', authMiddleware, controller.listDevicesHandler);
syncRouter.post('/devices', authMiddleware, validate(registerDeviceSchema), controller.registerDeviceHandler);
syncRouter.post('/events', authMiddleware, validate(syncEventsSchema), controller.ingestEventsHandler);
syncRouter.get('/conflicts', authMiddleware, controller.listConflictsHandler);
syncRouter.post(
  '/conflicts/:id/resolve',
  authMiddleware,
  validate(conflictIdParamsSchema, 'params'),
  validate(resolveConflictSchema),
  controller.resolveConflictHandler,
);
