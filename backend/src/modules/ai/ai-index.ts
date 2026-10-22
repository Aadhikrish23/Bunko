import { prisma } from '../../config/prisma';
import { logger } from '../../lib/logger';
import { aiConfigured, callAi } from './ai-client';

// Keeps a consenting user's embedding index current (T-080). Writes come in
// bursts (a reading session's worth of highlights), so re-indexing waits
// for a quiet moment instead of running per write; ai-service only
// re-embeds what actually changed.
const DEBOUNCE_MS = 30_000;
const pending = new Map<string, ReturnType<typeof setTimeout>>();

async function indexNow(userId: string): Promise<void> {
  const consent = await prisma.aiConsent.findUnique({ where: { userId } });
  if (!consent?.semanticSearch) return;
  await callAi('POST', '/internal/index', { userId });
}

export function scheduleAiIndex(userId: string, delayMs = DEBOUNCE_MS): void {
  if (!aiConfigured()) return;
  const existing = pending.get(userId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    pending.delete(userId);
    indexNow(userId).catch((err) => logger.warn({ err, userId }, 'AI re-index failed'));
  }, delayMs);
  // Never keep the process (or a test run) alive just for this.
  timer.unref?.();
  pending.set(userId, timer);
}
