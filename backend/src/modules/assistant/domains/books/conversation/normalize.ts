import type { Exchange } from '../../../conversation/RecentExchanges';

// What readers type, made plain before anything reads it: common typos, chat shorthand, and
// "the second one" right after the assistant listed books.

const REPLACEMENTS: [RegExp, string][] = [
  [/\b(finsihed|finshed|fnished|finised|fineshed|finsished)\b/gi, 'finished'],
  [/\b(finsih|finsh|finis)\b/gi, 'finish'],
  [/\b(readign|reaidng|raeding|redaing)\b/gi, 'reading'],
  [/\b(reveiw|reivew|reveiwed)\b/gi, 'review'],
  [/\b(libary|liberry|librray|libraby)\b/gi, 'library'],
  [/\b(shlef|shlef|shefl)\b/gi, 'shelf'],
  [/\b(bok|boook)\b/gi, 'book'],
  [/\b(recomend|reccomend|recommed|reccommend)\b/gi, 'recommend'],
  [/\bdnf'?d\b/gi, 'dnf'],
  [/\btbr\b/gi, 'want to read list'],
  [/\b(pls|plz|plez)\b/gi, 'please'],
  [/\b(rn)\b/gi, 'right now'],
  [/\b(ur)\b/gi, 'your'],
  [/\b(u)\b/gi, 'you'],
  [/\b(abt)\b/gi, 'about'],
  [/\b(bc|cuz|coz)\b/gi, 'because'],
  [/\b(gonna)\b/gi, 'going to'],
  [/\b(wanna)\b/gi, 'want to'],
  [/\b(gimme)\b/gi, 'give'],
  [/\b(thx|ty)\b/gi, 'thanks'],
];

export function normalizeSlang(message: string): string {
  let out = message;
  for (const [pattern, replacement] of REPLACEMENTS) out = out.replace(pattern, replacement);
  // "want to read list list" after "tbr list".
  return out.replace(/\bwant to read list list\b/gi, 'want to read list');
}

const ORDINALS: Record<string, number> = {
  first: 1, '1st': 1, one: 1,
  second: 2, '2nd': 2, two: 2,
  third: 3, '3rd': 3, three: 3,
  fourth: 4, '4th': 4, four: 4,
  fifth: 5, '5th': 5, five: 5,
  last: -1,
};

/** Book titles the assistant just listed ("- Piranesi by Susanna Clarke: ..."). */
export function listedTitles(reply: string): string[] {
  return reply
    .split('\n')
    .map((line) => line.match(/^\s*(?:[-•*]|\d+[.)])\s+(.+?)(?:\s+by\s+[^:]+)?(?::.*)?$/)?.[1]?.trim())
    .filter((t): t is string => Boolean(t));
}

/** "add the second one" right after a list names that book. */
export function resolveOrdinals(message: string, last?: Exchange): string {
  const titles = last ? listedTitles(last.assistant) : [];
  if (titles.length === 0) return message;
  return message.replace(/\b(?:the\s+)?(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|last)(?:\s+(?:one|book|pick))?\b/gi, (match, word: string) => {
    const n = ORDINALS[word.toLowerCase()];
    const title = n === -1 ? titles[titles.length - 1] : n ? titles[n - 1] : undefined;
    return title ?? match;
  });
}

/** "this one" on a book's page names that book. */
export function withPageBook(message: string, pageTitle?: string): string {
  if (!pageTitle) return message;
  return message.replace(/\b(this one|this book|this)\b(?!\s+(year|month|week))/i, pageTitle);
}
