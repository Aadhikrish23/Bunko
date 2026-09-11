import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createCopyHandler, createEditionHandler } from './editions.controller';
import { createCopySchema, createEditionSchema } from './editions.schema';

// Two small routers from one module (ARCHITECTURE.md §3 groups editions +
// copies + digital files together) — mounted at their own top-level
// paths (/editions, /copies) in app.ts, matching openapi.yaml.
export const editionsRouter = Router();
editionsRouter.post('/', authMiddleware, validate(createEditionSchema), createEditionHandler);

export const copiesRouter = Router();
copiesRouter.post('/', authMiddleware, validate(createCopySchema), createCopyHandler);
