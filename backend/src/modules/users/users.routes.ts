import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { getMeHandler, updateMeHandler } from './users.controller';
import { updateProfileSchema } from './users.schema';

export const usersRouter = Router();

usersRouter.get('/me', authMiddleware, getMeHandler);
usersRouter.patch('/me', authMiddleware, validate(updateProfileSchema), updateMeHandler);
