import type { NextFunction, Request, Response } from 'express';
import ms from 'ms';
import { env } from '../../config/env';
import { AppError } from '../../lib/app-error';
import { sendOk } from '../../lib/response';
import * as authService from './auth.service';
import type { LoginInput, RegisterInput } from './auth.schema';

const REFRESH_COOKIE_NAME = 'refreshToken';

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/v1/auth',
    maxAge: ms(env.JWT_REFRESH_EXPIRY),
  });
}

export async function registerHandler(
  req: Request<unknown, unknown, RegisterInput>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user, tokens } = await authService.register(req.body);
    setRefreshCookie(res, tokens.refreshToken);
    sendOk(res, { accessToken: tokens.accessToken, user }, 201);
  } catch (err) {
    next(err);
  }
}

export async function loginHandler(
  req: Request<unknown, unknown, LoginInput>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user, tokens } = await authService.login(req.body);
    setRefreshCookie(res, tokens.refreshToken);
    sendOk(res, { accessToken: tokens.accessToken, user });
  } catch (err) {
    next(err);
  }
}

export async function refreshHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    if (!token) {
      throw new AppError('UNAUTHENTICATED', 'Missing refresh token');
    }
    const tokens = await authService.refresh(token);
    setRefreshCookie(res, tokens.refreshToken);
    sendOk(res, { accessToken: tokens.accessToken });
  } catch (err) {
    next(err);
  }
}
