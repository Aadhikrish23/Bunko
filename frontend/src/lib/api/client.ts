import { getAccessToken, setAccessToken } from './token-store';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1';

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

async function tryRefresh(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, { method: 'POST', credentials: 'include' });
    if (!response.ok) return false;
    const json = (await response.json()) as Envelope<{ accessToken: string }>;
    setAccessToken(json.data.accessToken);
    return true;
  } catch {
    return false;
  }
}

async function request<T>(path: string, options: RequestOptions, retryOn401 = true): Promise<Envelope<T>> {
  const token = getAccessToken();
  const response = await fetch(buildUrl(path, options.query), {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers: {
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 401 && retryOn401 && token) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return request<T>(path, options, false);
    }
    setAccessToken(null);
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
  async delete<T>(path: string): Promise<T> {
    return (await request<T>(path, { method: 'DELETE' })).data;
  },
};
