import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/app-error';

// The single global error handler (registered last in app.ts) — the only
// place an error response is shaped (CODING_STANDARDS.md §5). Never leaks
// stack traces or raw Prisma error messages to the client.
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = req.id;

  if (err instanceof AppError) {
    req.log.error({ code: err.code }, err.message);
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
      meta: { requestId },
    });
    return;
  }

  if (err instanceof ZodError) {
    req.log.error({ issues: err.issues }, 'validation error');
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request failed validation',
        details: err.issues.map((issue) => ({ field: issue.path.join('.'), issue: issue.message })),
      },
      meta: { requestId },
    });
    return;
  }

  req.log.error({ err }, 'unhandled error');
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    meta: { requestId },
  });
};
