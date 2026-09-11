import { env } from './config/env';
import { createApp } from './app';
import { logger } from './lib/logger';
import { scheduleIdleTimeoutSweep, startIdleTimeoutWorker } from './modules/reading-sessions/idle-timeout.worker';

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`Bunko API listening on port ${env.PORT}`);
});

startIdleTimeoutWorker();
scheduleIdleTimeoutSweep().catch((err) => {
  logger.warn({ err }, 'failed to schedule idle-timeout sweep (Redis unreachable?)');
});
