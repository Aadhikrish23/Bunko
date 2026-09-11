import type { Request } from 'express';
import { AppError } from './app-error';

// Every controller for user-owned data reads req.user.id via this helper
// rather than a client-supplied field (CODING_STANDARDS.md §6). Throwing
// here (instead of a non-null assertion) keeps the failure mode explicit
// if a route ever forgets to apply authMiddleware.
export function requireUserId(req: Pick<Request, 'user'>): string {
  if (!req.user) {
    throw new AppError('UNAUTHENTICATED', 'Authentication required');
  }
  return req.user.id;
}
