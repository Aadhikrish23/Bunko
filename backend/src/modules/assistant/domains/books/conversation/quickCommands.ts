import type { AIIntent } from '../../../intent/AIIntent';
import { IntentParameterType } from '../../../intent/IntentParameterType';
import { IntentTargetType } from '../../../intent/IntentTargetType';
import { BookIntent } from '../intent/BookIntent';
import { toStatus, isPausedWord } from '../data/status';
import { statedScore } from '../pipeline/patterns';
import { titleScore } from '../text/match';

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

const clean = (s: string) =>
  s
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/[.!]+$/, '')
    .trim();

const STATUS_VERBS =
  /^(?:i\s*(?:'m|am|have|'ve)?\s*)?(?:just\s+|finally\s+|now\s+)?(started|starting|began|begun|finished|completed|dnf|gave up on|giving up on|abandoned|dropped|quit|am reading|'m reading|reading)\s+(.+)$/i;

/**
 * "dune and circe", "dune, circe & piranesi" -> separate books -- but "Pride and Prejudice"
 * stays whole when the reader owns it. Adjacent pieces are rejoined whenever the joined text
 * is one of their titles.
 */
export function splitBookList(raw: string, ownedTitles: string[] = []): string[] {
  const whole = clean(raw);
  const isOwned = (s: string) => ownedTitles.some((t) => titleScore(s, t) >= 90);
  if (!/,|\s(?:and|&)\s/i.test(whole) || isOwned(whole)) return [whole];
  const pieces = whole.split(/\s*,\s*(?:and\s+)?|\s+(?:and|&)\s+/i).map(clean).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < pieces.length; i++) {
    const joined = i + 1 < pieces.length ? `${pieces[i]} and ${pieces[i + 1]}` : undefined;
    if (joined && isOwned(joined) && !isOwned(pieces[i]!)) {
      out.push(joined);
      i++;
    } else {
      out.push(pieces[i]!);
    }
  }
  return out;
}

/** One clause -> one intent per book (or a status + rating pair), or undefined. */
export function parseCommand(clause: string, ownedTitles: string[] = []): AIIntent[] | undefined {
  const parsed = parseSingle(clause);
  if (!parsed) return undefined;
  // A list of books in one command becomes one intent per book.
  return parsed.flatMap((i) => {
    const target = i.targets.find((t) => t.type === IntentTargetType.Book || t.type === IntentTargetType.Library);
    if (!target) return [i];
    const books = splitBookList(target.name, ownedTitles);
    return books.map((name) => ({ ...i, targets: i.targets.map((t) => (t === target ? { ...t, name } : t)) }));
  });
}

function parseSingle(clause: string): AIIntent[] | undefined {
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
    rest = rest.replace(/\s+(?:last night|today|yesterday|this morning|this week|finally|at last)$/i, '');
    const status = toStatus(verb.replace(/^'m /, ''));
    if (!status) return undefined;
    const out = [intent(BookIntent.SetStatus, [bookT(clean(rest))], [{ type: IntentParameterType.Status, value: status }])];
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
    .map((c) => c.trim())
    .filter(Boolean);
}

/** Every clause of a message as intents, or undefined if any clause isn't a plain command. */
export function parseCommands(message: string, ownedTitles: string[] = []): AIIntent[] | undefined {
  const clauses = splitClauses(message);
  const out: AIIntent[] = [];
  for (const clause of clauses) {
    const parsed = parseCommand(clause, ownedTitles);
    if (!parsed) return undefined;
    out.push(...parsed);
  }
  return out.length ? out : undefined;
}
