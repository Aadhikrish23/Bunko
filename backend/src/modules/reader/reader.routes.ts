import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { getReaderManifestHandler } from './reader.controller';
import { editionIdParamsSchema } from './reader.schema';

// Mounted at the same base path as editionsRouter ('/api/v1/editions') —
// Express consults both in order, and the two define non-overlapping
// method/path pairs.
export const readerRouter = Router();

readerRouter.get(
  '/:editionId/reader-manifest',
  authMiddleware,
  validate(editionIdParamsSchema, 'params'),
  getReaderManifestHandler,
);
