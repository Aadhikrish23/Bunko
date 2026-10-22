const DEVICE_KEY = 'bunko:device-id';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let cachedDeviceId: string | null = null;

// One id per browser, sent as X-Device-Id (Phase 9, T-071) so the server
// can tell which device moved a reading position. Not a secret and never
// used for authorisation.
export function getDeviceId(): string {
  if (cachedDeviceId) return cachedDeviceId;
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing && UUID.test(existing)) return (cachedDeviceId = existing);
    const id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
    return (cachedDeviceId = id);
  } catch {
    // Storage blocked: an id for this page load only.
    return (cachedDeviceId = crypto.randomUUID());
  }
}

// "Chrome on Windows" — how this device appears in the device list and in
// sync-conflict prompts.
export function deviceLabel(userAgent: string): string {
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\/|Opera/.test(userAgent)
      ? 'Opera'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Chrome\/|CriOS\//.test(userAgent)
          ? 'Chrome'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : null;
  const os = /iPhone|iPad|iPod/.test(userAgent)
    ? 'iOS'
    : /Android/.test(userAgent)
      ? 'Android'
      : /CrOS/.test(userAgent)
        ? 'ChromeOS'
        : /Windows/.test(userAgent)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(userAgent)
            ? 'macOS'
            : /Linux/.test(userAgent)
              ? 'Linux'
              : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? 'This browser';
}
