import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { listJournalHandler } from './journal.controller';
import { listJournalQuerySchema } from './journal.schema';

export const journalRouter = Router();

journalRouter.get('/', authMiddleware, validate(listJournalQuerySchema, 'query'), listJournalHandler);
