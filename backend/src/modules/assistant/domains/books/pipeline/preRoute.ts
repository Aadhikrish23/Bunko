import type { PreRouteInput, PreRouteOutcome } from '../../../domain/DomainPack';
import { IntentParameterType } from '../../../intent/IntentParameterType';
import type { AIIntent } from '../../../intent/AIIntent';
import recentExchanges from '../../../conversation/RecentExchanges';
import { isConfirmReply } from '../../../conversation/PendingConfirmationStore';
import { BookIntent } from '../intent/BookIntent';
import { loadLibrary, loadShelves, snapshotOf } from '../data/library';
import { answerFromLibrary } from '../conversation/libraryAnswers';
import { parseCommands } from '../conversation/quickCommands';
import { withPageBook } from '../conversation/normalize';
import { isQuestionOnly, lastNamedTitle } from './planChecks';
import { DISCOVERY_ASK, EXPLICIT_ACTION, LOOKS_LIKE_QUESTION, POINTS_BACK, RECOMMEND_ASK } from './patterns';
import { IntentTargetType } from '../../../intent/IntentTargetType';
import { namedTitles } from '../text/match';
import { undoLastChange, UNDO_ASK } from './undo';

/**
 * Everything before (and instead of) the model: questions answered from the reader's own
 * data, recommendations, plain commands, undo -- then the model for the rest. Each of these
 * is instant and costs nothing against the daily allowance.
 */
// "can you put klara on my comfort reads shelf" is a request, not a question about shelves (R4-15).
const POLITE_REQUEST =
  /^\s*(?:hey|hi|ok|okay)?[\s,]*(?:can|could|would|will)\s+you\s+(?:please\s+)?(?=(?:put|add|mark|set|move|rate|remove|delete|take|create|make|note|review|start|shelve|file|undo)\b)/i;

export async function preRoute({ userId, requestId, message: said, client, session, requestContext, model }: PreRouteInput): Promise<PreRouteOutcome> {
  const message = said.replace(POLITE_REQUEST, '').replace(/\?\s*$/, (q) => (POLITE_REQUEST.test(said) ? '' : q));
  const [books, shelves] = await Promise.all([loadLibrary(userId), loadShelves(userId)]);
  requestContext.library = snapshotOf(books, shelves);
  requestContext.recentExchanges = recentExchanges.get(userId);
  const pageTitle = client.pageBookId ? books.find((b) => b._id === client.pageBookId)?.title : undefined;
  requestContext.page = pageTitle ? { bookTitle: pageTitle } : {};

  const titles = books.map((b) => b.title);
  const lastReply = recentExchanges.get(userId).slice(-1)[0]?.assistant ?? '';
  const currentTitle = lastNamedTitle(lastReply, titles) ?? session.references.currentBook?.displayName ?? pageTitle ?? null;
  const reply = (text: string): PreRouteOutcome => ({ kind: 'reply', response: { success: true, message: text } });
  const plan = (intents: AIIntent[]): PreRouteOutcome => ({ kind: 'plan', plan: { id: requestId, requestId, intents } });

  // "undo" / "undo that": put back what the last message changed.
  if (UNDO_ASK.test(message)) return reply(await undoLastChange(userId));

  // A "yes" with nothing waiting for one (the question expired, or the server restarted).
  if (isConfirmReply(message)) {
    return reply("There's nothing waiting for a yes right now; that question may have expired. Tell me again what you'd like and I'll ask once more.");
  }

  // Questions about the reader's own records, answered from their data.
  if (LOOKS_LIKE_QUESTION.test(message.trim()) || isQuestionOnly(message)) {
    const answer = await answerFromLibrary(withPageBook(message, pageTitle), { userId, books, shelves, currentTitle });
    if (answer) return reply(answer);
  }

  // "what should I read next?" needs no planning.
  if (RECOMMEND_ASK.test(message) && !EXPLICIT_ACTION.test(message)) {
    const intents: AIIntent[] = [
      { type: BookIntent.RecommendBook, confidence: 1, targets: [], parameters: [{ type: IntentParameterType.Text, value: message }] },
    ];
    // "something like Piranesi": their own list first, then the model for books beyond it.
    if (DISCOVERY_ASK.test(message)) intents.push({ type: BookIntent.AskQuestion, confidence: 1, targets: [], parameters: [] });
    return plan(intents);
  }

  // "rate dune 4", "finished circe", "put dune on my sci-fi shelf": no model needed.
  const quick = parseCommands(withPageBook(message, pageTitle), titles, shelves.map((s) => s.name));
  if (quick) {
    // "finished circe, 4 stars and put it on comfort reads": "it" is the book this message
    // names, not whatever the last turn was about.
    const named = namedTitles(message, titles);
    if (named.length === 1) {
      for (const i of quick) {
        i.targets = i.targets.map((t) => (t.type === IntentTargetType.Book && POINTS_BACK.test(t.name.trim()) ? { ...t, name: named[0]! } : t));
      }
    }
    return plan(quick);
  }

  try {
    return { kind: 'plan', plan: await model.planWithRetry(withPageBook(message, pageTitle), requestContext) };
  } catch (error) {
    // The planner couldn't produce a plan; a question still deserves an answer.
    if ((error as { code?: string })?.code === 'PROVIDER_VALIDATION_ERROR' && LOOKS_LIKE_QUESTION.test(message)) {
      const answer = await model.answerSafely(message, requestContext).catch(() => '');
      if (answer) return reply(answer);
    }
    throw error;
  }
}
