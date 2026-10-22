import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './ai.controller';
import {
  askSchema,
  consentSchema,
  editionIdParamsSchema,
  searchQuerySchema,
  translateSchema,
  translationsQuerySchema,
  workIdParamsSchema,
} from './ai.schema';

// Mounted at '/api/v1/ai' (SRS §28.3). Consent and the daily cap are
// enforced in the service; ai-service is never reachable from clients.
export const aiRouter = Router();

aiRouter.get('/status', authMiddleware, controller.statusHandler);
aiRouter.put('/consent', authMiddleware, validate(consentSchema), controller.consentHandler);
aiRouter.get('/search', authMiddleware, validate(searchQuerySchema, 'query'), controller.searchHandler);
aiRouter.post('/ask', authMiddleware, validate(askSchema), controller.askHandler);
aiRouter.post(
  '/works/:workId/summary',
  authMiddleware,
  validate(workIdParamsSchema, 'params'),
  controller.summaryHandler,
);
aiRouter.post('/insights', authMiddleware, controller.insightsHandler);
aiRouter.post('/recommendations', authMiddleware, controller.recommendationsHandler);

// Chapter translation (SRS §20.5, Phase 11).
aiRouter.post(
  '/editions/:editionId/translations',
  authMiddleware,
  validate(editionIdParamsSchema, 'params'),
  validate(translateSchema),
  controller.requestTranslationHandler,
);
aiRouter.get(
  '/editions/:editionId/translations',
  authMiddleware,
  validate(editionIdParamsSchema, 'params'),
  validate(translationsQuerySchema, 'query'),
  controller.listTranslationsHandler,
);
