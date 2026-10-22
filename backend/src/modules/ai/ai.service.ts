import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/app-error';
import { redisConnection } from '../../lib/queue';
import { aiConfigured, callAi } from './ai-client';
import { scheduleAiIndex } from './ai-index';
import type { ConsentInput } from './ai.schema';
import { TRANSLATION_LANGUAGES, type TranslationLanguage } from './translation-languages';

// Bumped whenever docs/AI_DATA_POLICY.md (and the in-app disclosure)
// changes materially; the stored version records what the user agreed to.
export const AI_POLICY_VERSION = '2026-10-22.3'; // .2: chapter translation; .3: assistant chat on NVIDIA NIM

export interface AiStatus {
  available: { semanticSearch: boolean; generative: boolean; translation: boolean };
  consent: { semanticSearch: boolean; generative: boolean; translation: boolean; policyVersion: string | null };
  currentPolicyVersion: string;
  dailyGenerationLimit: number;
  dailyTranslationChars: number;
  translationLanguages: readonly TranslationLanguage[];
}

interface HealthResponse {
  status: string;
  generative: boolean;
}

// ai-service's health is checked at most once a minute.
let healthCache: { at: number; value: AiStatus['available'] } | null = null;
const HEALTH_TTL_MS = 60_000;

// Translation uses the same Claude access as generated insights.
export async function availability(): Promise<AiStatus['available']> {
  if (!aiConfigured()) return { semanticSearch: false, generative: false, translation: false };
  if (healthCache && Date.now() - healthCache.at < HEALTH_TTL_MS) return healthCache.value;
  let value: AiStatus['available'];
  try {
    const health = await callAi<HealthResponse>('GET', '/health', undefined, 5_000);
    const generative = health.status === 'ok' && health.generative;
    value = { semanticSearch: health.status === 'ok', generative, translation: generative };
  } catch {
    value = { semanticSearch: false, generative: false, translation: false };
  }
  healthCache = { at: Date.now(), value };
  return value;
}

export async function getStatus(userId: string): Promise<AiStatus> {
  const [available, consent] = await Promise.all([availability(), prisma.aiConsent.findUnique({ where: { userId } })]);
  return {
    available,
    consent: {
      semanticSearch: consent?.semanticSearch ?? false,
      generative: consent?.generative ?? false,
      translation: consent?.translation ?? false,
      policyVersion: consent?.policyVersion ?? null,
    },
    currentPolicyVersion: AI_POLICY_VERSION,
    dailyGenerationLimit: env.AI_DAILY_GENERATION_LIMIT,
    dailyTranslationChars: env.AI_DAILY_TRANSLATION_CHARS,
    translationLanguages: TRANSLATION_LANGUAGES,
  };
}

// Turning semantic search off deletes the user's embeddings right away —
// directly, so it works even when ai-service is down (§20.4: revoking has
// to mean something). Turning translation off deletes their saved
// translations the same way (§20.5); a job still running stops at its next
// consent check.
export async function setConsent(userId: string, input: ConsentInput): Promise<AiStatus> {
  const before = await prisma.aiConsent.findUnique({ where: { userId } });
  await prisma.aiConsent.upsert({
    where: { userId },
    create: { userId, ...input, policyVersion: AI_POLICY_VERSION },
    update: { ...input, policyVersion: AI_POLICY_VERSION },
  });
  if (!input.semanticSearch) {
    await prisma.aiEmbedding.deleteMany({ where: { userId } });
  } else if (!before?.semanticSearch) {
    scheduleAiIndex(userId, 0);
  }
  if (!input.translation) {
    await prisma.chapterTranslation.deleteMany({ where: { userId } });
  }
  return getStatus(userId);
}

const CONSENT_NAMES = {
  semanticSearch: 'search by meaning',
  generative: 'generated insights',
  translation: 'chapter translation',
} as const;

export async function requireConsent(userId: string, kind: keyof typeof CONSENT_NAMES): Promise<void> {
  const consent = await prisma.aiConsent.findUnique({ where: { userId } });
  if (!consent?.[kind]) {
    throw new AppError('FORBIDDEN', `Turn on ${CONSENT_NAMES[kind]} in Settings first`);
  }
}

// Each generation costs real money and sends data to the provider, so it's
// capped per user per day (T-086).
export async function countGeneration(userId: string): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  const key = `ai:generations:${userId}:${day}`;
  const used = await redisConnection.incr(key);
  if (used === 1) await redisConnection.expire(key, 2 * 86_400);
  if (used > env.AI_DAILY_GENERATION_LIMIT) {
    throw new AppError('RATE_LIMITED', `You've reached today's limit of ${env.AI_DAILY_GENERATION_LIMIT} AI requests`);
  }
}

async function generate<T>(userId: string, path: string, body: Record<string, unknown>): Promise<T & { generated: true }> {
  await requireConsent(userId, 'generative');
  await countGeneration(userId);
  const result = await callAi<T>('POST', path, { userId, ...body });
  // §20.3: generated output is always marked as an interpretation.
  return { ...result, generated: true as const };
}

export async function search(userId: string, q: string) {
  await requireConsent(userId, 'semanticSearch');
  return callAi<{ results: unknown[] }>('POST', '/internal/search', { userId, query: q, limit: 20 }, 30_000);
}

export function ask(userId: string, question: string) {
  return generate(userId, '/internal/ask', { question });
}

export async function summarizeWork(userId: string, workId: string) {
  const membership = await prisma.userWork.findUnique({ where: { userId_workId: { userId, workId } } });
  if (!membership) throw new AppError('NOT_FOUND', 'Work not found in your library');
  return generate(userId, '/internal/summary', { workId });
}

export function insights(userId: string) {
  return generate(userId, '/internal/insights', {});
}

export function recommendations(userId: string) {
  return generate(userId, '/internal/recommendations', {});
}
