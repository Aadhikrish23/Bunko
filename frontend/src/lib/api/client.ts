import { getDeviceId } from '../device';
import { getAccessToken, setAccessToken } from './token-store';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
    ? `${window.location.protocol}//${window.location.hostname}:3000/api/v1`
    : 'http://localhost:3000/api/v1');


export interface ApiErrorDetail {
  field: string;
  issue: string;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: ApiErrorDetail[];

  constructor(code: string, message: string, status: number, details?: ApiErrorDetail[]) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

// The request never reached the server (offline, DNS, server down) —
// distinct from an ApiError, which is the server answering. Offline-aware
// hooks (Phase 9) fall back to local data or the sync outbox on this.
export class NetworkError extends Error {
  constructor() {
    super('You appear to be offline.');
    this.name = 'NetworkError';
  }
}

interface Envelope<T> {
  data: T;
  meta: { requestId: string; page?: number; pageSize?: number; total?: number };
}

interface ErrorEnvelope {
  error: { code: string; message: string; details?: ApiErrorDetail[] };
  meta: { requestId: string };
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(`${API_BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export type RefreshResult = 'refreshed' | 'rejected' | 'offline';

let refreshInFlight: Promise<RefreshResult> | null = null;

async function refreshOnce(): Promise<RefreshResult> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, { method: 'POST', credentials: 'include' });
    if (!response.ok) return 'rejected';
    const json = (await response.json()) as Envelope<{ accessToken: string }>;
    setAccessToken(json.data.accessToken);
    return 'refreshed';
  } catch {
    return 'offline';
  }
}

/**
 * Trades the refresh cookie for a new access token. Refresh tokens rotate on every use, so two
 * refreshes racing with the same cookie sign the reader out (the loser looks like token reuse).
 * Callers in this tab share the one request in flight, and tabs take turns through a Web Lock,
 * so each sends the cookie the previous refresh just set.
 */
export function refreshSession(): Promise<RefreshResult> {
  if (!refreshInFlight) {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    // request() resolves with the callback's settled result; the DOM typings don't unwrap it.
    const run = locks
      ? (locks.request('bunko-auth-refresh', () => refreshOnce()) as unknown as Promise<RefreshResult>)
      : refreshOnce();
    refreshInFlight = run.finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function request<T>(path: string, options: RequestOptions, retryOn401 = true): Promise<Envelope<T>> {
  const token = getAccessToken();
  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      credentials: 'include',
      headers: {
        'X-Device-Id': getDeviceId(),
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new NetworkError();
  }

  if (response.status === 401 && retryOn401 && token) {
    if ((await refreshSession()) === 'refreshed') {
      return request<T>(path, options, false);
    }
    // Only drop the token that failed, never one a newer sign-in has set meanwhile.
    if (getAccessToken() === token) setAccessToken(null);
  }

  if (response.status === 204) {
    return { data: undefined as T, meta: { requestId: '' } };
  }

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    const errBody = json as ErrorEnvelope | null;
    throw new ApiError(
      errBody?.error?.code ?? 'INTERNAL_ERROR',
      errBody?.error?.message ?? 'Something went wrong. Please try again.',
      response.status,
      errBody?.error?.details,
    );
  }

  return json as Envelope<T>;
}

export const api = {
  async get<T>(path: string, query?: RequestOptions['query']): Promise<T> {
    return (await request<T>(path, { method: 'GET', query })).data;
  },
  async getPaginated<T>(path: string, query?: RequestOptions['query']): Promise<PaginatedResult<T>> {
    const envelope = await request<T[]>(path, { method: 'GET', query });
    return {
      items: envelope.data,
      page: envelope.meta.page ?? 1,
      pageSize: envelope.meta.pageSize ?? envelope.data.length,
      total: envelope.meta.total ?? envelope.data.length,
    };
  },
  async post<T>(path: string, body?: unknown): Promise<T> {
    return (await request<T>(path, { method: 'POST', body })).data;
  },
  async patch<T>(path: string, body?: unknown): Promise<T> {
    return (await request<T>(path, { method: 'PATCH', body })).data;
  },
  async put<T>(path: string, body?: unknown): Promise<T> {
    return (await request<T>(path, { method: 'PUT', body })).data;
  },
  async delete<T>(path: string): Promise<T> {
    return (await request<T>(path, { method: 'DELETE' })).data;
  },
};
