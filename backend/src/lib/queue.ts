import IORedis from 'ioredis';
import { env } from '../config/env';
import { logger } from './logger';

// Shared BullMQ connection (ARCHITECTURE.md §1 — Redis + BullMQ for
// background jobs), for Queue instances and simple non-blocking
// GET/SET/DEL use (files.service.ts) — safe to share since none of
// that holds the connection open. maxRetriesPerRequest: null is
// BullMQ's documented requirement for its blocking commands. The
// 'error' listener prevents an unhandled EventEmitter 'error' from
// crashing the process if Redis is briefly unreachable — connection
// retries happen in the background.
export const redisConnection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

redisConnection.on('error', (err) => {
  logger.warn({ err }, 'Redis connection error');
});

// Each BullMQ Worker needs its OWN connection, not this shared one —
// a Worker holds its connection in a blocking wait (BRPOPLPUSH-style)
// for the next job, so two Workers sharing one connection contend with
// each other and can stall. (This project has more than one Worker —
// idle-timeout and ocr-backfill — so this isn't a hypothetical.)
export function createWorkerConnection(): IORedis {
  const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  connection.on('error', (err) => {
    logger.warn({ err }, 'Redis worker connection error');
  });
  return connection;
}
