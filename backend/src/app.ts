import express, { type Express } from 'express';
import { mountApiDocs } from './docs/swagger';

export function createApp(): Express {
  const app = express();

  app.use(express.json());

  // Placeholder health check — proves the base server runs (T-001).
  app.get('/health', (_req, res) => {
    res.status(200).json({ data: { status: 'ok' } });
  });

  mountApiDocs(app);

  return app;
}
