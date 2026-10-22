import { createHash } from 'crypto';

// Identifies the exact chapter text a translation was made from, so a
// re-extracted chapter shows its old translation as stale (T-088).
export function hashChapterText(text: string): string {
  return createHash('sha256').update(text.trim()).digest('hex');
}
