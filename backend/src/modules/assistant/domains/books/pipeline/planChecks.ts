import type { IntentPlan } from '../../../intent/IntentPlan';
import type { AIIntent } from '../../../intent/AIIntent';
import { IntentParameterType } from '../../../intent/IntentParameterType';
import { IntentTargetType } from '../../../intent/IntentTargetType';
import type { Exchange } from '../../../conversation/RecentExchanges';
import type { GroundingResult } from '../../../domain/DomainPack';
import { BookIntent, PER_BOOK, READ_ONLY } from '../intent/BookIntent';
import { loadLibrary, type BookRecord } from '../data/library';
import { toStatus } from '../data/status';
import { mentions, namedTitles, norm, rankByTitle, titleScore } from '../text/match';
import { splitBookList } from '../conversation/quickCommands';
import {
  EXPLICIT_ACTION,
  LOOKS_LIKE_QUESTION,
  MENTIONS_POINTER,
  POINTS_BACK,
  RECOMMEND_ASK,
  statedScore,
  wasAskedFor,
} from './patterns';

const textParam = (intent: AIIntent) => intent.parameters?.find((p) => p.type === IntentParameterType.Text);
const bookTargets = (intent: AIIntent) => (intent.targets ?? []).filter((t) => t.type === IntentTargetType.Book);
const intent = (type: string, targets: AIIntent['targets'], parameters: AIIntent['parameters'] = []): AIIntent => ({
  type,
  confidence: 1,
  targets,
  parameters,
});

/** A question that changes nothing ("should I read Dune or Hyperion first?"). */
export function isQuestionOnly(message: string): boolean {
  return LOOKS_LIKE_QUESTION.test(message.trim()) && !/\b(and|then|also|,)\s+(add|mark|rate|put|remove|delete|note|set|create|move)\b/i.test(message) &&
    !/^(can|could|would|will) you\b/i.test(message.trim());
}

/** StartBook / FinishBook / DnfBook become SetStatus; status words become Bunko's values. */
export function normalizePlan(plan: IntentPlan): void {
  const implied: Record<string, string> = {
    [BookIntent.StartBook]: 'READING',
    [BookIntent.FinishBook]: 'FINISHED',
    [BookIntent.DnfBook]: 'DID_NOT_FINISH',
  };
  for (const i of plan.intents ?? []) {
    const status = implied[i.type];
    if (status) {
      i.type = BookIntent.SetStatus;
      i.parameters = [...(i.parameters ?? []).filter((p) => p.type !== IntentParameterType.Status), { type: IntentParameterType.Status, value: status }];
    }
    if (i.type === BookIntent.SetStatus) {
      for (const p of i.parameters ?? []) {
        if (p.type === IntentParameterType.Status) p.value = toStatus(p.value) ?? String(p.value);
      }
    }
    // The model sometimes types the target of an add as Book: an add is always a search (Library).
    if (i.type === BookIntent.AddBook) {
      i.targets = (i.targets ?? []).map((t) => (t.type === IntentTargetType.Book ? { ...t, type: IntentTargetType.Library } : t));
    }
    // The model sometimes takes a whole phrase like "a shelf called
    // favorites" as the Collection's name instead of just "favorites"
    // (R7-01) -- a deterministic backstop alongside the prompt's own
    // instruction and example not to.
    i.targets = (i.targets ?? []).map((t) =>
      t.type === IntentTargetType.Collection ? { ...t, name: stripCollectionNamePhrase(t.name) } : t,
    );
  }
}

/** "a shelf called favorites" / "the collection named Cozy Reads" -> "favorites" / "Cozy Reads". */
function stripCollectionNamePhrase(name: string): string {
  return name.replace(/^\s*(a|the|my)?\s*(shelf|collection)\s+(called|named)\s+/i, '').trim() || name;
}

/**
 * The model's plan checked against the message's own words. Returns how many changes were
 * dropped because nothing in the message asked for them.
 */
export function correctPlan(plan: IntentPlan, message: string): number {
  // A question never changes anything.
  if (isQuestionOnly(message)) {
    const reads = plan.intents.filter((i) => READ_ONLY.has(i.type));
    plan.intents = reads.length > 0 ? reads : [intent(BookIntent.AskQuestion, [])];
    return 0;
  }

  // "I DNF'd it" / "dropping X" is a status, never a removal from the library.
  if (/\b(dnf|did ?n[o']?t finish|gave up|giving up|abandon\w*|drop(ped|ping)?|quit)\b/i.test(message) && !/\b(library|remove|delete)\b/i.test(message)) {
    for (const i of plan.intents) {
      if (i.type !== BookIntent.RemoveBook) continue;
      i.type = BookIntent.SetStatus;
      i.targets = (i.targets ?? []).map((t) => ({ ...t, type: IntentTargetType.Book }));
      i.parameters = [{ type: IntentParameterType.Status, value: 'DID_NOT_FINISH' }];
    }
  }

  // "finished Piranesi, 5 stars": the score is a rating even if the model only planned the status.
  const score = statedScore(message);
  if (score && !plan.intents.some((i) => i.type === BookIntent.RateBook || i.type === BookIntent.ReviewBook)) {
    const target = plan.intents.flatMap((i) => i.targets ?? []).find((t) => t.type === IntentTargetType.Book || t.type === IntentTargetType.Library);
    if (target?.name) {
      plan.intents.push(intent(BookIntent.RateBook, [{ type: IntentTargetType.Book, name: target.name }], [{ type: IntentParameterType.Rating, value: score.scale === 10 ? score.value / 2 : score.value }]));
    }
  }
  // A "9/10" the model passed through as 9 is out of ten.
  if (score?.scale === 10) {
    for (const i of plan.intents) {
      for (const p of i.parameters ?? []) if (p.type === IntentParameterType.Rating && Number(p.value) === score.value) p.value = score.value / 2;
    }
  }

  // "read me my notes on X" is never a note to save.
  if (/\b(read|show|what are|list|see)\b[^.?!]*\bnotes?\b/i.test(message) && !/\b(add|save|jot|write)\b/i.test(message)) {
    plan.intents = plan.intents.map((i) =>
      i.type === BookIntent.AddNote ? intent(BookIntent.LibraryQuestion, [], [{ type: IntentParameterType.Text, value: message }]) : i,
    );
  }

  const before = plan.intents.length;
  plan.intents = plan.intents.filter((i) => wasAskedFor(i.type, message));
  return before - plan.intents.length;
}

export interface GroundingInput {
  userId: string;
  message: string;
  lastExchange?: Exchange;
  currentTitle: string | null;
  pageTitle: string | null;
}

/** The book the last reply was about: the title it names last. */
export function lastNamedTitle(reply: string, titles: string[]): string | null {
  let best: { title: string; at: number } | null = null;
  const r = norm(reply);
  for (const title of titles) {
    const at = r.lastIndexOf(norm(title));
    if (at >= 0 && (!best || at > best.at || (at === best.at && title.length > best.title.length))) best = { title, at };
  }
  return best?.title ?? null;
}

const AUTO_ADD = new Set<string>([BookIntent.SetStatus, BookIntent.RateBook, BookIntent.ReviewBook, BookIntent.OrganizeShelf]);

/**
 * Ties the plan to real books: only books the reader named or clearly pointed at ("it"),
 * review text from their own words, no overwriting a written review, and books they don't
 * have yet added first when the change makes sense for a new book.
 */
export async function groundPlan(plan: IntentPlan, input: GroundingInput): Promise<GroundingResult> {
  const { userId, message } = input;
  const books = await loadLibrary(userId);
  const titles = books.map((b) => b.title);
  const named = namedTitles(message, titles);
  const referent = input.currentTitle && titles.includes(input.currentTitle) ? input.currentTitle : null;
  const pointsBack = MENTIONS_POINTER.test(message);
  const authorNamed = (b: BookRecord) =>
    b.authors.some((a) => norm(a).split(' ').some((w) => w.length >= 4 && new RegExp(`\\b${w}\\b`).test(norm(message))));

  // "Dune and Circe" as one target: split into the reader's own titles (one intent each).
  plan.intents = plan.intents.flatMap((i) => {
    const target = bookTargets(i).find((t) => (rankByTitle(t.name, books)[0]?.score ?? 0) < 90);
    if (!target) return [i];
    const parts = splitBookList(target.name, titles);
    if (parts.length < 2) return [i];
    return parts.map((name) => ({ ...i, targets: i.targets.map((t) => (t === target ? { ...t, name } : t)) }));
  });

  let ungrounded = 0;
  const skippedMissing: string[] = [];
  const keptReviews: string[] = [];
  const next: AIIntent[] = [];
  const adding = new Set<string>();

  for (const i of plan.intents) {
    if (i.type === BookIntent.AddBook) {
      const name = i.targets?.[0]?.name ?? '';
      if (POINTS_BACK.test(name.trim())) {
        ungrounded++;
        continue;
      }
      adding.add(norm(name));
      next.push(i);
      continue;
    }
    const targets = bookTargets(i);
    if (targets.length === 0) {
      next.push(i);
      continue;
    }
    let keep = true;
    let missing = false;
    for (const t of targets) {
      // "it" -> the book the conversation is about (or the page the reader is on).
      if (POINTS_BACK.test(t.name.trim()) || !t.name.trim()) {
        const meant = referent ?? input.pageTitle ?? (named.length === 1 ? named[0]! : null);
        if (!meant) {
          keep = false;
          break;
        }
        t.name = meant;
        continue;
      }
      const best = rankByTitle(t.name, books)[0];
      const owned = best && best.score >= 80 ? best.item : undefined;
      if (owned) {
        const grounded =
          mentions(message, owned.title) || mentions(message, t.name) || named.includes(owned.title) ||
          (pointsBack && (owned.title === referent || owned.title === input.pageTitle)) ||
          owned.title === input.pageTitle ||
          authorNamed(owned);
        if (!grounded) {
          keep = false;
          break;
        }
        t.name = owned.title;
        continue;
      }
      // Close to one of their own books: the tool asks which one rather than adding a
      // stranger's book with a similar name.
      if (best && best.score >= 70) continue;
      // Not in the library. Being added in this same message?
      if ([...adding].some((a) => titleScore(t.name, a) >= 85)) continue;
      if (AUTO_ADD.has(i.type) && !(i.type === BookIntent.OrganizeShelf && i.parameters?.some((p) => p.type === IntentParameterType.Boolean && (p.value === false || p.value === 'false')))) {
        // "finished Piranesi" for a book they don't have yet: add it first, then do the rest.
        next.push(intent(BookIntent.AddBook, [{ type: IntentTargetType.Library, name: t.name }]));
        adding.add(norm(t.name));
        continue;
      }
      skippedMissing.push(t.name);
      missing = true;
      keep = false;
      break;
    }
    if (!keep) {
      // A missing book is reported by name; anything else was aimed at a book nobody named.
      if (!missing) ungrounded++;
      continue;
    }
    next.push(i);
  }
  plan.intents = next;

  // Review text must be the reader's own words from this message, and must not silently
  // replace a review they wrote before (only "review X: ..." / "change my review" does).
  const said = new Set(norm(message).split(' '));
  const rewrites = /\breview\b|\b(change|update|edit|replace|rewrite)\b[^.?!]*\b(comment|text|what i wrote)\b/i.test(message);
  for (const i of plan.intents) {
    if (i.type !== BookIntent.RateBook && i.type !== BookIntent.ReviewBook) continue;
    const text = textParam(i);
    if (!text || typeof text.value !== 'string') continue;
    const words = norm(text.value).split(' ').filter(Boolean);
    const own = words.length > 0 && words.filter((w) => said.has(w)).length / words.length >= 0.6;
    const instruction = /\b(rate|rating|stars?|out of|mark it|give it)\b/i.test(text.value) && words.length <= 6;
    const title = bookTargets(i)[0]?.name;
    const existing = books.find((b) => b.title === title)?.reviewBody;
    if (!own || instruction) {
      i.parameters = i.parameters.filter((p) => p !== text);
    } else if (existing && existing.trim() !== text.value.trim() && !rewrites) {
      i.parameters = i.parameters.filter((p) => p !== text);
      if (title) keptReviews.push(title);
    }
  }
  // A rating intent left with nothing to save does nothing.
  plan.intents = plan.intents.filter(
    (i) => (i.type !== BookIntent.RateBook && i.type !== BookIntent.ReviewBook) || i.parameters?.some((p) => p.type === IntentParameterType.Rating || p.type === IntentParameterType.Text),
  );

  // "finished X" for a book already owned: no need to re-add it.
  plan.intents = plan.intents.filter((i) => {
    if (i.type !== BookIntent.AddBook) return true;
    const name = i.targets?.[0]?.name ?? '';
    const owned = books.find((b) => titleScore(name, b.title) >= 97);
    return !owned || !plan.intents.some((o) => o !== i && bookTargets(o).some((t) => t.name === owned.title));
  });

  return { ungrounded, skippedMissing, keptReviews };
}

/**
 * Final shape: a recommendation ask stays a recommendation, one intent per book, and "add X"
 * plus "set X to Want to Read" is one step (new books start as Want to Read).
 */
export function shapePlan(plan: IntentPlan, message: string, fromModel: boolean): void {
  if (fromModel && RECOMMEND_ASK.test(message) && !EXPLICIT_ACTION.test(message)) {
    // A question riding along ("...anything new like Piranesi?") stays, for the model's answer.
    const asks = plan.intents.filter((i) => i.type === BookIntent.AskQuestion);
    plan.intents = [intent(BookIntent.RecommendBook, [], [{ type: IntentParameterType.Text, value: message }]), ...asks];
    return;
  }

  plan.intents = plan.intents.flatMap((i) => {
    if (!PER_BOOK.has(i.type)) return [i];
    const books = (i.targets ?? []).filter((t) => t.type === IntentTargetType.Book || t.type === IntentTargetType.Library);
    if (books.length <= 1) return [i];
    const others = (i.targets ?? []).filter((t) => !books.includes(t));
    return books.map((b) => ({ ...i, targets: [...others, b] }));
  });

  const added = plan.intents.filter((i) => i.type === BookIntent.AddBook).map((i) => i.targets?.[0]?.name ?? '');
  plan.intents = plan.intents.filter((i) => {
    if (i.type !== BookIntent.SetStatus) return true;
    const status = String(i.parameters?.find((p) => p.type === IntentParameterType.Status)?.value ?? '');
    const name = i.targets?.[0]?.name ?? '';
    return !(status === 'WANT_TO_READ' && added.some((a) => titleScore(a, name) >= 85));
  });

  // The same change twice ("add dune ... add dune") runs once.
  const seen = new Set<string>();
  plan.intents = plan.intents.filter((i) => {
    const key = JSON.stringify([i.type, (i.targets ?? []).map((t) => `${t.type}:${norm(t.name)}`), i.parameters]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export { textParam };
