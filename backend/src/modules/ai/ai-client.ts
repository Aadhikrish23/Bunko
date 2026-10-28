import { env } from '../../config/env';
import { AppError } from '../../lib/app-error';

// The only way anything reaches ai-service (ARCHITECTURE.md §8): internal
// HTTP with a shared token. Every failure becomes AI_UNAVAILABLE so the
// app degrades to "this feature isn't available right now".

export function aiConfigured(): boolean {
  return Boolean(env.AI_SERVICE_URL && env.AI_SERVICE_TOKEN);
}

interface AiErrorBody {
  detail?: { code?: string; message?: string } | string;
}

// Generation can take a while (model reasoning + a full answer); indexing
// a large library too.
const DEFAULT_TIMEOUT_MS = 120_000;

export async function callAi<T>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  if (!aiConfigured()) throw new AppError('AI_UNAVAILABLE', 'AI features are not set up on this server');

  let response: Response;
  try {
    response = await fetch(`${env.AI_SERVICE_URL}${path}`, {
      method,
      headers: {
        'X-Internal-Token': env.AI_SERVICE_TOKEN!,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new AppError('AI_UNAVAILABLE', 'The AI service is not reachable right now');
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as AiErrorBody | null;
    const detail = payload?.detail;
    const code = typeof detail === 'object' ? detail?.code : undefined;
    // "Nothing of yours to work from" is the reader's situation, not an outage.
    if (code === 'NO_DATA' && typeof detail === 'object' && detail?.message) {
      throw new AppError('VALIDATION_ERROR', detail.message);
    }
    const message =
      code === 'DECLINED'
        ? 'The AI model declined this request.'
        : code === 'LLM_UNAVAILABLE'
          ? 'Generated insights are not set up on this server.'
          : 'The AI service could not complete this request.';
    throw new AppError('AI_UNAVAILABLE', message);
  }
  return (await response.json()) as T;
}
