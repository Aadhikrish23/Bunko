// Catalogue descriptions often open with publisher copy rather than the story: a press quote
// with its attribution, or an ALL-CAPS line ("NEW YORK TIMES BESTSELLER •"). Those are trimmed
// for display only; anything else, including a description that is itself a quotation, is
// shown as it came.

const CAPS_TOKEN = /^[^\s\p{Ll}]+$/u;
const CONNECTOR = /^(on|of|the|and|for|in|a|an|at|by|from|to)$/;

/** Leading run of tokens with no lowercase letters ("WINNER OF THE HUGO AWARD 2016 •"). */
function stripCapsRun(text: string): string {
  const tokens = text.split(/\s+/);
  let n = 0;
  while (n < tokens.length && CAPS_TOKEN.test(tokens[n]!)) n++;
  // "I" or "A" opening the next sentence ("... OZAWA I was born") belongs to it.
  while (n > 0 && /^\p{Ll}/u.test(tokens[n] ?? '')) n--;
  const letters = tokens.slice(0, n).join('').replace(/[^\p{Lu}]/gu, '').length;
  // A shouted sentence ("I AM NOT A MONSTER.") is the book's own words, not a banner.
  const isSentence = /[.!?]["”’]?$/.test(tokens[n - 1] ?? '');
  return n >= 3 && letters >= 12 && !isSentence ? tokens.slice(n).join(' ') : text;
}

/** A leading `"Quote." - Source on Title (Notes)` blurb. */
function stripPressQuote(text: string): string {
  const quote = /^["“][^"”]{1,400}["”]\s*[-—–―]+\s*/.exec(text);
  if (!quote) return text;
  let rest = text.slice(quote[0].length);
  // The attribution: capitalised words, short connectors and parentheticals, up to the
  // next ALL-CAPS run (which stripCapsRun takes) or the first ordinary sentence.
  for (let guard = 0; guard < 25 && rest; guard++) {
    const paren = /^\([^)]{0,200}\)\s*/.exec(rest);
    if (paren) {
      rest = rest.slice(paren[0].length);
      continue;
    }
    const [word = '', next = ''] = rest.split(/\s+/, 2);
    const isCaps = CAPS_TOKEN.test(word) && /\p{Lu}{2}/u.test(word);
    if (isCaps && CAPS_TOKEN.test(next) && /\p{Lu}{2}/u.test(next)) break;
    if (!/^\p{Lu}/u.test(word) && !CONNECTOR.test(word)) break;
    // A capitalised word followed by a lowercase one starts a sentence ("This is the way").
    if (/^\p{Lu}\p{Ll}/u.test(word) && /^\p{Ll}/u.test(next) && !CONNECTOR.test(next)) break;
    rest = rest.slice(word.length).trimStart();
  }
  return rest;
}

/** Markdown emphasis some catalogues send ("**From the *New York Times* bestselling...**"). */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/gs, '$1')
    .replace(/__(.+?)__/gs, '$1')
    .replace(/(^|[\s(“"])\*(?!\s)(.+?)(?<!\s)\*(?=[\s.,;:!?)”"]|$)/gm, '$1$2')
    .replace(/(^|[\s(“"])_(?!\s)(.+?)(?<!\s)_(?=[\s.,;:!?)”"]|$)/gm, '$1$2');
}

export function cleanSynopsis(text: string): string {
  const original = stripMarkdown(text.trim());
  let current = original;
  for (let i = 0; i < 4; i++) {
    const next = stripCapsRun(stripPressQuote(current)).trim();
    if (next === current) break;
    current = next;
  }
  // Never leave a stub: if most of it went, the "copy" was probably the description.
  return current.length >= 80 && current.length >= original.length * 0.4 ? current : original;
}
