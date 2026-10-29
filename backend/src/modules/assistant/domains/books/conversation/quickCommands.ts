import type { AIIntent } from '../../../intent/AIIntent';
import { IntentParameterType } from '../../../intent/IntentParameterType';
import { IntentTargetType } from '../../../intent/IntentTargetType';
import { BookIntent } from '../intent/BookIntent';
import { toStatus, isPausedWord } from '../data/status';
import { statedScore } from '../pipeline/patterns';
import { mainTitle, matchShelf, norm, titleScore } from '../text/match';

// Plain one-step commands, read without the model: "add piranesi", "rate dune 4",
// "finished circe", "note for dune: ...", "put dune on my sci-fi shelf". Deliberately strict:
// anything that doesn't fit exactly goes to the model.

const intent = (type: string, targets: AIIntent['targets'], parameters: AIIntent['parameters'] = []): AIIntent => ({
  type,
  confidence: 1,
  targets,
  parameters,
});
const bookT = (name: string) => ({ type: IntentTargetType.Book, name });
const libraryT = (name: string) => ({ type: IntentTargetType.Library, name });
const shelfT = (name: string) => ({ type: IntentTargetType.Collection, name });

// Chat filler that isn't part of a title: "dnf'd circe tbh", "rate it 5 actually".
const TRAILING_FILLER =
  /(?:\s+(?:tbh|lol|lmao|honestly|already|actually|anyway|rn|right now|please|pls|too|as well|instead|again|haha|now|then|ok|okay))+\s*$/i;

const clean = (s: string) =>
  s
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/[.!?]+$/, '')
    .replace(TRAILING_FILLER, '')
    .trim();

// "started reading circe": "started" is the verb and "reading" is filler before the title,
// not part of it -- without the optional group, "reading" fell into the title match and the
// whole phrase was searched for as "reading circe" (R5-05).
const STATUS_VERBS =
  /^(?:i\s*(?:'m|am|have|'ve)?\s*)?(?:just\s+|finally\s+|now\s+)?(started|starting|began|begun|finished|completed|dnf|gave up on|giving up on|abandoned|dropped|quit|am reading|'m reading|reading)(?:\s+reading)?\s+(.+)$/i;

/**
 * "dune and circe", "dune, circe & piranesi" -> separate books -- but "Pride and Prejudice"
 * stays whole when the reader owns it. Adjacent pieces are rejoined whenever the joined text
 * is one of their titles.
 */
export function splitBookList(raw: string, ownedTitles: string[] = []): string[] {
  const whole = clean(raw);
  const score = (s: string) => Math.max(0, ...ownedTitles.map((t) => titleScore(s, t)));
  const isOwned = (s: string) => score(s) >= 80;
  if (!/,|\s(?:and|&)\s/i.test(whole) || isOwned(whole)) return [whole];
  const pieces = whole.split(/\s*,\s*(?:and\s+)?|\s+(?:and|&)\s+/i).map(clean).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < pieces.length; i++) {
    const joined = i + 1 < pieces.length ? `${pieces[i]} and ${pieces[i + 1]}` : undefined;
    // "pride" opens "Pride and Prejudice", but the joined words name it better.
    if (joined && isOwned(joined) && score(joined) > score(pieces[i]!)) {
      out.push(joined);
      i++;
    } else {
      out.push(pieces[i]!);
    }
  }
  // Split only into books the reader actually has; otherwise "and" may be part of a title
  // nobody here knows, and the model (or "isn't in your library") is the better answer.
  return out.every(isOwned) ? out : [whole];
}

/**
 * Owned titles that contain commas or "and" ("Tomorrow, and Tomorrow, and Tomorrow") are
 * swapped for placeholders before a message is cut into clauses, so their punctuation can't
 * split them. Matching forgives missing punctuation and case.
 */
function maskTitles(message: string, ownedTitles: string[]): { text: string; restore: (s: string) => string } {
  const masked: string[] = [];
  let text = message;
  const risky = ownedTitles.filter((t) => /,|;|\s(?:and|&)\s/i.test(t)).sort((a, b) => b.length - a.length);
  for (const title of risky) {
    const words = title
      .split(/[\s,;:&]+/)
      .filter(Boolean)
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${words.join('[\\s,;:&]+')}(?![\\p{L}\\p{N}])`, 'giu');
    text = text.replace(pattern, () => {
      masked.push(title);
      return `⟦${masked.length - 1}⟧`;
    });
  }
  const restore = (s: string) => s.replace(/⟦(\d+)⟧/g, (_m, i: string) => masked[Number(i)] ?? '');
  return { text, restore };
}

/** One clause -> one intent per book (or a status + rating pair), or undefined. */
export function parseCommand(clause: string, ownedTitles: string[] = [], shelfNames: string[] = []): AIIntent[] | undefined {
  const parsed = parseSingle(clause, ownedTitles, shelfNames);
  if (!parsed) return undefined;
  // A list of books in one command becomes one intent per book.
  return parsed.flatMap((i) => {
    const target = i.targets.find((t) => t.type === IntentTargetType.Book || t.type === IntentTargetType.Library);
    if (!target) return [i];
    const books = splitBookList(target.name, ownedTitles);
    return books.map((name) => ({ ...i, targets: i.targets.map((t) => (t === target ? { ...t, name } : t)) }));
  });
}

const LIBRARY_PLACE = /^(?:my\s+)?(?:library|list|reading list|want to read list|tbr)$/i;

function parseSingle(clause: string, ownedTitles: string[] = [], shelfNames: string[] = []): AIIntent[] | undefined {
  const text = clean(clause);
  if (!text) return undefined;
  let m: RegExpMatchArray | null;

  if ((m = text.match(/^(?:please\s+)?(?:create|make|start|add)\s+(?:a\s+)?(?:new\s+)?shelf\s+(?:called|named)\s+(.+)$/i))) {
    return [intent(BookIntent.CreateShelf, [shelfT(clean(m[1]!))])];
  }
  if ((m = text.match(/^(?:please\s+)?(?:take|remove|move)\s+(.+?)\s+(?:off|out of|from)\s+(?:my\s+|the\s+)?(.+?)\s+shelf$/i))) {
    return [intent(BookIntent.OrganizeShelf, [shelfT(clean(m[2]!)), bookT(clean(m[1]!))], [{ type: IntentParameterType.Boolean, value: false }])];
  }
  if ((m = text.match(/^(?:please\s+)?(?:put|add|move|shelve|file)\s+(.+?)\s+(?:on|onto|to|in|into|under)\s+(?:my\s+|the\s+)?(.+?)\s+shelf$/i))) {
    return [intent(BookIntent.OrganizeShelf, [shelfT(clean(m[2]!)), bookT(clean(m[1]!))])];
  }
  // "put circe on comfort reads", "add circe to comfort reads": a shelf without the word
  // "shelf". "add" needs a shelf the reader has (otherwise "add X to Y" may be a title);
  // a status ("put it on hold", "move it to reading") is a status.
  if ((m = text.match(/^(?:please\s+)?(put|shelve|file|move|add)\s+(.+?)\s+(on|onto|to|in|into|under)\s+(?:my\s+|the\s+)?(.+)$/i))) {
    const [, verb, book, prep, place] = m as unknown as [string, string, string, string, string];
    const status = toStatus(place);
    const paused = isPausedWord(`${prep} ${place}`);
    const known = matchShelf(place, shelfNames.map((name) => ({ name })));
    // "add circe to book club": Circe is theirs, and "circe to book club" names no book of theirs.
    const score = (s: string) => Math.max(0, ...ownedTitles.map((t) => titleScore(s, t)));
    const whole = text.replace(/^(?:please\s+)?\S+\s+/i, '');
    const ownBook = score(book) >= 80 && score(whole) < score(book);
    if ((status || paused) && /^(put|move)$/i.test(verb)) {
      return [intent(BookIntent.SetStatus, [bookT(clean(book))], [{ type: IntentParameterType.Status, value: status ?? `${prep} ${place}` }])];
    }
    if (!status && !paused && !LIBRARY_PLACE.test(place) && (known || ownBook || !/^add$/i.test(verb))) {
      return [intent(BookIntent.OrganizeShelf, [shelfT(known?.name ?? clean(place)), bookT(clean(book))])];
    }
  }
  if ((m = text.match(/^(?:please\s+)?(?:add\s+(?:a\s+)?note|note)\s+(?:for|on|to|about)\s+(.+?)\s*:\s*(.+)$/i))) {
    return [intent(BookIntent.AddNote, [bookT(clean(m[1]!))], [{ type: IntentParameterType.Text, value: m[2]!.trim() }])];
  }
  if ((m = text.match(/^(?:please\s+)?(?:delete|remove|clear)\s+(?:my\s+)?(?:review|rating)\s+(?:of|for|on)\s+(.+)$/i))) {
    return [intent(BookIntent.DeleteReview, [bookT(clean(m[1]!))])];
  }
  if ((m = text.match(/^(?:please\s+)?review\s+(.+?)\s*:\s*(.+)$/i))) {
    return [intent(BookIntent.ReviewBook, [bookT(clean(m[1]!))], [{ type: IntentParameterType.Text, value: m[2]!.trim() }])];
  }
  if ((m = text.match(/^(?:please\s+)?(?:rate|give)\s+(.+?)\s+(?:a\s+)?(\d+(?:\.\d+)?)(?:\s*(?:\/\s*(?:5|10)|out of (?:5|10)|stars?))?(?:\s*[,.:;-]+\s*(.+))?$/i))) {
    const score = statedScore(text);
    const value = score ? (score.scale === 10 ? score.value / 2 : score.value) : Number(m[2]);
    const comment = m[3]?.trim();
    return [
      intent(BookIntent.RateBook, [bookT(clean(m[1]!))], [
        { type: IntentParameterType.Rating, value },
        ...(comment ? [{ type: IntentParameterType.Text, value: comment }] : []),
      ]),
    ];
  }
  if ((m = text.match(/^(?:please\s+)?(?:remove|delete)\s+(.+?)(?:\s+from\s+(?:my\s+)?library)?$/i)) && !/\b(review|rating|note|shelf)\b/i.test(text)) {
    return [intent(BookIntent.RemoveBook, [bookT(clean(m[1]!))])];
  }
  if ((m = text.match(/^(?:please\s+)?(?:mark|set|move)\s+(.+?)\s+(?:as|to)\s+(.+)$/i))) {
    const raw = m[2]!;
    const status = toStatus(raw);
    if (status || isPausedWord(raw)) return [intent(BookIntent.SetStatus, [bookT(clean(m[1]!))], [{ type: IntentParameterType.Status, value: status ?? raw }])];
  }
  if ((m = text.match(STATUS_VERBS))) {
    const verb = m[1]!.toLowerCase();
    let rest = m[2]!;
    const score = statedScore(rest);
    // "finished piranesi, 5 stars, the house was unforgettable": the words after the score are a review.
    const scored = rest.match(/^(.*?)[,.;:-]?\s*(?:it'?s\s+(?:a\s+)?|gave it\s+(?:a\s+)?)?\d+(?:\.\d+)?\s*(?:\/\s*(?:5|10)|out of (?:5|10)|stars?)\s*[,.;:!-]*\s*(.*)$/i);
    let comment: string | undefined;
    if (score && scored) {
      rest = scored[1]!;
      comment = scored[2]?.trim() || undefined;
    } else {
      // "finished circe, loved it": the title stops at the comma.
      rest = rest.split(/\s*[,;]\s*/)[0] ?? rest;
    }
    // "finished circe last night": when, for the finish date (R4-05).
    const when = /\b(last night|yesterday)\b/i.exec(rest)?.[1];
    rest = rest.replace(/\s+(?:last night|today|yesterday|this morning|this week|finally|at last)$/i, '');
    // "Klara and the Sun around halfway": one of their titles, then how far they got.
    rest = rest.replace(/\s+(?:around|about|at|after|just past|past|only)?\s*(?:halfway(?: through)?|midway|the (?:start|beginning|middle|end)|(?:page|p\.)\s*\d+|\d+\s*(?:pages|chapters|%)(?: in)?|chapter \d+)$/i, '');
    const said = norm(rest);
    const ownedLead = ownedTitles
      .map((t) => ({ t, key: norm(mainTitle(t)) }))
      .filter(({ key }) => key.length >= 3 && said.startsWith(`${key} `))
      .sort((a, b) => b.key.length - a.key.length)[0];
    if (ownedLead) rest = ownedLead.t;
    const status = toStatus(verb.replace(/^'m /, ''));
    if (!status) return undefined;
    const out = [
      intent(BookIntent.SetStatus, [bookT(clean(rest))], [
        { type: IntentParameterType.Status, value: status },
        ...(when ? [{ type: IntentParameterType.Date, value: when.toLowerCase() }] : []),
      ]),
    ];
    if (score) {
      out.push(
        intent(BookIntent.RateBook, [bookT(clean(rest))], [
          { type: IntentParameterType.Rating, value: score.scale === 10 ? score.value / 2 : score.value },
          ...(comment ? [{ type: IntentParameterType.Text, value: comment }] : []),
        ]),
      );
    }
    return out;
  }
  if ((m = text.match(/^(?:please\s+)?(?:add|save|track)\s+(.+?)(?:\s+to\s+(?:my\s+)?(?:library|want to read list|reading list|list))?$/i)) && !/\bshelf\b/i.test(text)) {
    return [intent(BookIntent.AddBook, [libraryT(clean(m[1]!))])];
  }
  return undefined;
}

/** "add dune and mark it reading" -> clauses; undefined when splitting would be a guess. */
export function splitClauses(message: string): string[] {
  return message
    .split(/\s*(?:;|\.\s+|,?\s+and then\s+|,?\s+then\s+|,?\s+also\s+|,\s*and\s+|\s+and\s+(?=(?:add|rate|mark|set|put|take|remove|delete|note|review|start|finish|create|make)\b))\s*/i)
    .map((c) =>
      c
        .trim()
        .replace(/^(?:(?:and|also|then|ok|okay|so|oh|well|btw|plus|but|alright|right)\b[\s,]*)+/i, '')
        .trim(),
    )
    .filter(Boolean);
}

// "make a shelf called X and add BOOK to it": parseSingle's own shelf
// patterns all require a literal trailing "...shelf", which "to it" (a
// pronoun for the shelf a just-processed clause created) never has, so
// that clause fell through to undefined -- kicking the *whole* message to
// the model, which doesn't always reliably keep the OrganizeShelf intent
// either (R10-01's original report, and reproduced again after that fix:
// consistently dropped the shelf-add silently for an "and"-containing
// title + "to it"). Resolved deterministically here instead, with
// cross-clause state parseSingle doesn't have.
const ADD_TO_IT = /^(?:please\s+)?(?:put|add|move|shelve|file)\s+(.+?)\s+(?:on it|onto it|to it|in it|into it|under it)\.?$/i;

/** Every clause of a message as intents, or undefined if any clause isn't a plain command. */
export function parseCommands(message: string, ownedTitles: string[] = [], shelfNames: string[] = []): AIIntent[] | undefined {
  const { text, restore } = maskTitles(message, ownedTitles);
  const clauses = splitClauses(text);
  const out: AIIntent[] = [];
  let lastCreatedShelf: string | undefined;
  for (const clause of clauses) {
    const addToIt = clause.match(ADD_TO_IT);
    if (addToIt && lastCreatedShelf) {
      out.push(intent(BookIntent.OrganizeShelf, [shelfT(lastCreatedShelf), bookT(clean(addToIt[1]!))]));
      continue;
    }
    const parsed = parseCommand(clause, ownedTitles, shelfNames);
    if (!parsed) return undefined;
    out.push(...parsed);
    const created = parsed.find((i) => i.type === BookIntent.CreateShelf);
    if (created) lastCreatedShelf = created.targets.find((t) => t.type === IntentTargetType.Collection)?.name;
  }
  for (const i of out) {
    i.targets = i.targets.map((t) => ({ ...t, name: restore(t.name) }));
    i.parameters = i.parameters.map((p) => (typeof p.value === 'string' ? { ...p, value: restore(p.value) } : p));
  }
  return out.length ? out : undefined;
}
