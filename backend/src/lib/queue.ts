import IORedis from 'ioredis';
import { env } from '../config/env';
import { logger } from './logger';

// Shared BullMQ connection (ARCHITECTURE.md §1 — Redis + BullMQ for
// background jobs). maxRetriesPerRequest: null is BullMQ's documented
// requirement for its blocking commands. The 'error' listener prevents
// an unhandled EventEmitter 'error' from crashing the process if Redis is
// briefly unreachable — connection retries happen in the background.
export const redisConnection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

redisConnection.on('error', (err) => {
  logger.warn({ err }, 'Redis connection error');
});
