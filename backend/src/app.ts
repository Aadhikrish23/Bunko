import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import { env } from './config/env';
import { mountApiDocs } from './docs/swagger';
import { errorHandler } from './middleware/error-handler';
import { notFoundHandler } from './middleware/not-found';
import { requestLogger } from './middleware/request-logger';
import { sendOk } from './lib/response';
import { authRouter } from './modules/auth/auth.routes';
import { usersRouter } from './modules/users/users.routes';
import { worksRouter } from './modules/library/library.routes';
import { metadataRouter } from './modules/metadata/metadata.routes';
import { copiesRouter, editionsRouter } from './modules/editions/editions.routes';
import { shelvesRouter } from './modules/shelves/shelves.routes';
import { readingSessionsRouter } from './modules/reading-sessions/reading-sessions.routes';
import { journalRouter } from './modules/journal/journal.routes';
import { statisticsRouter } from './modules/statistics/statistics.routes';
import { filesRouter } from './modules/files/files.routes';
import { readerRouter } from './modules/reader/reader.routes';
import { continuityRouter } from './modules/continuity/continuity.routes';
import { annotationsForEditionRouter, annotationsRouter } from './modules/annotations/annotations.routes';
import { notesForWorkRouter, notesRouter } from './modules/notes/notes.routes';
import { reviewsRouter } from './modules/reviews/reviews.routes';
import {
  soundtrackForWorkRouter,
  soundtrackMappingsRouter,
  soundtracksRouter,
} from './modules/soundtrack/soundtrack.routes';

export function createApp(): Express {
  const app = express();

  app.use(requestLogger);
  app.use(
    cors({
      origin: (origin, callback) => {
        if (
          !origin ||
          origin === env.FRONTEND_ORIGIN ||
          /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.\d+\.\d+\.\d+|26\.\d+\.\d+\.\d+)(:\d+)?$/.test(
            origin,
          )
        ) {
          callback(null, true);
        } else {
          callback(null, false);
        }
      },
      credentials: true,
    }),
  );

  app.use(cookieParser());
  app.use(express.json());

  // Placeholder health check — proves the base server runs (T-001).
  app.get('/health', (_req, res) => {
    sendOk(res, { status: 'ok' });
  });

  mountApiDocs(app);

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/users', usersRouter);
  app.use('/api/v1/works', worksRouter);
  app.use('/api/v1/works', notesForWorkRouter);
  app.use('/api/v1/notes', notesRouter);
  app.use('/api/v1/works', reviewsRouter);
  app.use('/api/v1/works', soundtrackForWorkRouter);
  app.use('/api/v1/soundtracks', soundtracksRouter);
  app.use('/api/v1/soundtrack-mappings', soundtrackMappingsRouter);
  app.use('/api/v1/metadata', metadataRouter);
  app.use('/api/v1/editions', editionsRouter);
  app.use('/api/v1/editions', readerRouter);
  app.use('/api/v1/editions', annotationsForEditionRouter);
  app.use('/api/v1/annotations', annotationsRouter);
  app.use('/api/v1/copies', copiesRouter);
  app.use('/api/v1/shelves', shelvesRouter);
  app.use('/api/v1/reading-sessions', readingSessionsRouter);
  app.use('/api/v1/journal', journalRouter);
  app.use('/api/v1/statistics', statisticsRouter);
  app.use('/api/v1/files', filesRouter);
  app.use('/api/v1/reading-journeys', continuityRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
