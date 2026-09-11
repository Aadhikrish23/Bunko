// Holds the in-memory access token outside React state so the plain
// fetch-based client (client.ts) can read/write it without importing
// React or the auth context — avoids a circular dependency between the
// two.
let currentAccessToken: string | null = null;
const listeners = new Set<(token: string | null) => void>();

export function getAccessToken(): string | null {
  return currentAccessToken;
}

export function setAccessToken(token: string | null): void {
  currentAccessToken = token;
  listeners.forEach((listener) => listener(token));
}

export function onAccessTokenChange(listener: (token: string | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
