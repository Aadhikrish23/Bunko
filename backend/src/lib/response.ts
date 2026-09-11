import type { Response } from 'express';

// The one place the success envelope is shaped (docs/API_SPEC.md §3) —
// every controller calls this rather than calling res.json() directly.
export function sendOk<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ data, meta: { requestId: res.req.id } });
}

export function sendPaginated<T>(
  res: Response,
  data: T[],
  pagination: { page: number; pageSize: number; total: number },
): void {
  res.status(200).json({ data, meta: { requestId: res.req.id, ...pagination } });
}
