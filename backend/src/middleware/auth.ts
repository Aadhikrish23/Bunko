import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../lib/app-error';

interface AccessTokenPayload {
  sub: string;
  email: string;
}

// Verifies the JWT and sets req.user (CODING_STANDARDS.md §6). Applied
// explicitly on every route that needs it — there is no framework-level
// global guard, so a missing authMiddleware on a route is the single
// most important thing a reviewer checks (§6).
export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new AppError('UNAUTHENTICATED', 'Missing or malformed Authorization header'));
    return;
  }

  const token = header.slice('Bearer '.length);

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    next(new AppError('UNAUTHENTICATED', 'Invalid or expired access token'));
  }
}
