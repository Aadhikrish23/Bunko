import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { searchMetadataHandler } from './metadata.controller';
import { searchMetadataQuerySchema } from './metadata.schema';

export const metadataRouter = Router();

metadataRouter.get('/search', authMiddleware, validate(searchMetadataQuerySchema, 'query'), searchMetadataHandler);
