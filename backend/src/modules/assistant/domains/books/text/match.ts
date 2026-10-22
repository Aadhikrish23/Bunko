import { distance } from 'fastest-levenshtein';

// Title matching for books. Unicode-aware on purpose: Bunko's readers have books in Tamil,
// Japanese, Hindi... and the core's TitleNormalizer keeps only a-z/0-9, which would turn
// those titles into empty strings.

/** Lowercase, accents off, punctuation to spaces; letters of any script kept. */
export function norm(text: string): string {
  return (text ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** "Project Hail Mary: A Novel" -> "Project Hail Mary"; "Dune (Dune Chronicles #1)" -> "Dune". */
export function mainTitle(title: string): string {
  const cut = title.split(/\s*[:;—–(\[]|\s+-\s+/)[0] ?? title;
  return cut.trim() || title;
}

const ARTICLE = /^(the|a|an)\s+/;

function bare(text: string): string {
  return norm(text).replace(ARTICLE, '');
}

function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 0 : 1 - distance(a, b) / max;
}

/**
 * How well what the reader typed names this title, 0-100. Exact or subtitle-free matches
 * score highest; every typed word appearing in the title scores well ("hail mary"); close
 * spelling scores by similarity ("projcet hail mary").
 */
export function titleScore(query: string, title: string): number {
  const q = bare(query);
  if (!q) return 0;
  const full = bare(title);
  const main = bare(mainTitle(title));
  if (q === full) return 100;
  if (q === main) return 97;
  const qWords = q.split(' ');
  const mainWords = main.split(' ');
  const fullWords = full.split(' ');
  // Every word typed is in the title, and they say something ("hail mary", not "the").
  if (qWords.every((w) => fullWords.includes(w)) && q.replace(/\s/g, '').length >= 4) {
    const coverage = qWords.length / mainWords.length;
    return Math.round(70 + 20 * Math.min(1, coverage));
  }
  const best = Math.max(similarity(q, main), similarity(q, full));
  return Math.round(best * 100);
}

export interface Scored<T> {
  item: T;
  score: number;
}

export function rankByTitle<T extends { title: string }>(query: string, items: T[]): Scored<T>[] {
  return items
    .map((item) => ({ item, score: titleScore(query, item.title) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
}

/**
 * Whether a message mentions this title: its main title appears as whole words, or a run of
 * words in the message spells it closely ("finsihed projetc hail mary"). Short titles ("It",
 * "Us") must match exactly so ordinary words don't count.
 */
export function mentions(message: string, title: string): boolean {
  const msg = ` ${norm(message)} `;
  const main = bare(mainTitle(title));
  if (!main) return false;
  if (msg.includes(` ${main} `)) return main.length >= 3 || /[^\p{Script=Latin}\s\d]/u.test(main);
  const full = bare(title);
  if (full !== main && msg.includes(` ${full} `)) return true;
  const words = main.split(' ');
  if (main.replace(/\s/g, '').length < 6) return false;
  const msgWords = norm(message).split(' ');
  for (let i = 0; i + words.length <= msgWords.length; i++) {
    const window = msgWords.slice(i, i + words.length).join(' ');
    if (similarity(window.replace(ARTICLE, ''), main) >= 0.85) return true;
  }
  return false;
}

/**
 * Titles (from `titles`) the message names, longest first. A longer title's words are taken
 * out before shorter ones are looked for, so "Dune Messiah" alone doesn't also count as
 * "Dune", while "Dune Messiah ... than Dune" names both.
 */
export function namedTitles(message: string, titles: string[]): string[] {
  let rest = ` ${norm(message)} `;
  const named: string[] = [];
  for (const title of [...titles].sort((a, b) => b.length - a.length)) {
    if (!mentions(rest, title)) continue;
    named.push(title);
    for (const form of [norm(title), bare(mainTitle(title))]) {
      const at = rest.indexOf(` ${form} `);
      if (at >= 0) {
        rest = `${rest.slice(0, at)} ${rest.slice(at + form.length + 1)}`;
        break;
      }
    }
  }
  return named;
}

/** A shelf the reader named: exact, without the word "shelf", or close spelling. */
export function matchShelf<T extends { name: string }>(name: string, shelves: T[]): T | undefined {
  const q = norm(name).replace(/\b(shelf|shelves|list)\b/g, '').trim();
  if (!q) return undefined;
  const scored = shelves
    .map((shelf) => {
      const n = norm(shelf.name).replace(/\b(shelf|shelves|list)\b/g, '').trim();
      return { shelf, score: n === q ? 1 : similarity(n, q) };
    })
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  return best && best.score >= 0.8 ? best.shelf : undefined;
}

/** "a, b and c" */
export function listJoin(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
