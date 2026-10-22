import type { NextFunction, Request, Response } from 'express';
import { requireUserId } from '../../lib/require-user';
import { sendOk } from '../../lib/response';
import * as aiService from './ai.service';
import type { AskInput, ConsentInput, SearchQuery, TranslateInput, TranslationsQuery } from './ai.schema';
import * as translationService from './translation.service';

type Handler<P = Record<string, string>, B = unknown> = (
  req: Request<P, unknown, B>,
  res: Response,
  next: NextFunction,
) => Promise<void>;

function handle<P, B>(run: (req: Request<P, unknown, B>) => Promise<unknown>): Handler<P, B> {
  return async (req, res, next) => {
    try {
      sendOk(res, await run(req));
    } catch (err) {
      next(err);
    }
  };
}

export const statusHandler = handle((req) => aiService.getStatus(requireUserId(req)));
export const consentHandler = handle<Record<string, string>, ConsentInput>((req) =>
  aiService.setConsent(requireUserId(req), req.body),
);
export const searchHandler = handle((req) =>
  aiService.search(requireUserId(req), (req.query as unknown as SearchQuery).q),
);
export const askHandler = handle<Record<string, string>, AskInput>((req) =>
  aiService.ask(requireUserId(req), req.body.question),
);
export const summaryHandler = handle<{ workId: string }, unknown>((req) =>
  aiService.summarizeWork(requireUserId(req), req.params.workId),
);
export const insightsHandler = handle((req) => aiService.insights(requireUserId(req)));
export const recommendationsHandler = handle((req) => aiService.recommendations(requireUserId(req)));
export const requestTranslationHandler = handle<{ editionId: string }, TranslateInput>((req) =>
  translationService.requestTranslation(
    requireUserId(req),
    req.params.editionId,
    req.body.structuralId,
    req.body.targetLanguage,
  ),
);
export const listTranslationsHandler = handle<{ editionId: string }, unknown>((req) =>
  translationService.listTranslations(
    requireUserId(req),
    req.params.editionId,
    (req.query as unknown as TranslationsQuery).targetLanguage,
  ),
);
