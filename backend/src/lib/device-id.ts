import type { Request } from 'express';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// X-Device-Id (Phase 9, T-071): which of the user's devices sent the
// request. Optional — a client that doesn't send it still works — and
// used only for attribution (who moved the canonical position), never
// for authorisation.
export function requestDeviceId(req: Pick<Request, 'header'>): string | null {
  const value = req.header('x-device-id');
  return value && UUID.test(value) ? value.toLowerCase() : null;
}
