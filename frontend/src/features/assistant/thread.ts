import type { AssistantReply } from '../../lib/api/assistant';

// The chat thread's pure logic (T-102): what's kept, how a reply is split into prose and a
// list, and where book titles sit in a reply so they can be set in the book face.

export type Turn =
  | { id: string; role: 'reader'; text: string }
  | {
      id: string;
      role: 'assistant';
      text: string;
      status: AssistantReply['status'] | 'UNAVAILABLE';
      /** Buttons for "which one?" / "remove it?"; cleared once answered. */
      choices?: { label: string; tone: 'confirm' | 'danger' | 'neutral' }[];
      reason?: string;
      /** The reader message to resend after an outage. */
      retry?: string;
    };

const MAX_TURNS = 60;

export function turnFromReply(id: string, reply: AssistantReply): Turn {
  const candidates = reply.clarificationRequest?.candidates ?? [];
  const confirming = reply.status === 'CONFIRMATION_REQUIRED';
  return {
    id,
    role: 'assistant',
    text: reply.message,
    status: reply.status,
    choices: candidates.length
      ? candidates.map((c) => ({
          label: c.label,
          tone: confirming ? (/^yes/i.test(c.label) ? (/remove|delete/i.test(c.label) ? 'danger' : 'confirm') : 'neutral') : 'neutral',
        }))
      : undefined,
    reason: confirming ? reply.clarificationRequest?.reason : undefined,
  };
}

/** Choices only belong to the latest turn: answering (or moving on) retires them. */
export function retireChoices(turns: Turn[]): Turn[] {
  return turns.map((t) => (t.role === 'assistant' && (t.choices || t.retry) ? { ...t, choices: undefined, retry: undefined } : t));
}

export function capTurns(turns: Turn[]): Turn[] {
  return turns.length > MAX_TURNS ? turns.slice(-MAX_TURNS) : turns;
}

/** A reply as paragraphs and "- item" lists, in order. */
export type Block = { kind: 'p'; text: string } | { kind: 'list'; items: string[] };

export function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const item = line.match(/^\s*[-•*]\s+(.*)$/);
    const last = blocks[blocks.length - 1];
    if (item) {
      if (last?.kind === 'list') last.items.push(item[1]!);
      else blocks.push({ kind: 'list', items: [item[1]!] });
    } else if (line.trim()) {
      blocks.push({ kind: 'p', text: line.trim() });
    }
  }
  return blocks;
}

/** Text split into plain runs and the library titles inside it (longest titles win). */
export function markTitles(text: string, titles: string[]): { text: string; title: boolean }[] {
  const usable = [...new Set(titles.filter((t) => t.trim().length >= 3))].sort((a, b) => b.length - a.length);
  if (usable.length === 0) return [{ text, title: false }];
  const escaped = usable.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${escaped.join('|')})(?![\\p{L}\\p{N}])`, 'gu');
  const out: { text: string; title: boolean }[] = [];
  let at = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > at) out.push({ text: text.slice(at, match.index), title: false });
    out.push({ text: match[0], title: true });
    at = match.index + match[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at), title: false });
  return out;
}

export function storageKey(userId: string): string {
  return `bunko:assistant-thread:${userId}`;
}

export function loadThread(userId: string): Turn[] {
  try {
    const raw = sessionStorage.getItem(storageKey(userId));
    const parsed = raw ? (JSON.parse(raw) as Turn[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveThread(userId: string, turns: Turn[]): void {
  try {
    sessionStorage.setItem(storageKey(userId), JSON.stringify(capTurns(turns)));
  } catch {
    // Private mode or full storage: the thread just won't survive navigation.
  }
}
