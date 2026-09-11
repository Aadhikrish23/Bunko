import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { loginHandler, refreshHandler, registerHandler } from './auth.controller';
import { loginSchema, registerSchema } from './auth.schema';

export const authRouter = Router();

authRouter.post('/register', validate(registerSchema), registerHandler);
authRouter.post('/login', validate(loginSchema), loginHandler);
authRouter.post('/refresh', refreshHandler);
