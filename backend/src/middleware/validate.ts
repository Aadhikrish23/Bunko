import type { NextFunction, Request, Response } from 'express';
import type { ZodSchema } from 'zod';

type ValidationTarget = 'body' | 'params' | 'query';

// Shared validation middleware (CODING_STANDARDS.md §4) — applied in
// *.routes.ts before the controller runs. Unknown fields are stripped or
// rejected by the schema itself (.strict()), never silently accepted.
export function validate(schema: ZodSchema, target: ValidationTarget = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[target]);
      if (target === 'body') {
        req.body = parsed;
      } else if (target === 'params') {
        req.params = parsed as typeof req.params;
      } else {
        req.query = parsed as typeof req.query;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
