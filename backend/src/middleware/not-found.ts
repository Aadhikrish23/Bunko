import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../lib/app-error';

// Catch-all for unmatched routes so a 404 still returns the standard
// envelope (docs/API_SPEC.md §3) instead of Express's default HTML page.
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError('NOT_FOUND', `No route for ${req.method} ${req.path}`));
}
