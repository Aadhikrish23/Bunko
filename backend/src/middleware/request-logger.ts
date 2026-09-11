import { randomUUID } from 'crypto';
import type { Request } from 'express';
import pinoHttp from 'pino-http';
import { logger } from '../lib/logger';

// Structured request/response logging with a requestId correlated across
// the request's lifecycle (SRS §32). userId is attached once auth
// middleware has run, since pino-http logs completion after the whole
// request/response cycle. pino-http types its callback params against
// Node's IncomingMessage, not Express's augmented Request, hence the cast.
export const requestLogger = pinoHttp({
  logger,
  genReqId: (_req, res) => {
    const id = randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
  customProps: (req) => ({ userId: (req as Request).user?.id }),
});
