import type { IntentPlan } from '../../../intent/IntentPlan';
import { IntentParameterType } from '../../../intent/IntentParameterType';
import pendingConfirmations from '../../../conversation/PendingConfirmationStore';
import { confirmationResponse, type RuntimeResponse } from '../../../pipeline/Replies';
import type { FollowUpOffer } from '../../../domain/DomainPack';
import { updateWork } from '../../../../library/library.service';
import { BookIntent } from '../intent/BookIntent';
import { loadLibrary } from '../data/library';
import { listJoin } from '../text/match';
import { STATUS_LABEL } from '../data/status';

interface ResolvedPlanLike {
  intents: { type: string; resolvedTargets: { originalTarget: { name: string }; resolution?: { entity?: { title?: string } } }[] }[];
}

/**
 * Removing a book always asks first (SRS §20.6), naming exactly which books, so "yes" removes
 * exactly those. Bunko keeps reading history, notes and reviews when a book leaves the
 * library, and the question says so.
 */
export async function askBeforeRemoving(
  plan: IntentPlan,
  resolved: ResolvedPlanLike,
  { userId, requestId, message }: { userId: string; requestId: string; message: string },
): Promise<RuntimeResponse | undefined> {
  const removals = resolved.intents.filter((i) => i.type === BookIntent.RemoveBook);
  const titleByName = new Map<string, string>();
  for (const removal of removals) {
    for (const rt of removal.resolvedTargets) {
      const title = rt.resolution?.entity?.title;
      if (title) titleByName.set(rt.originalTarget.name, title);
    }
  }
  const titles = [...new Set(titleByName.values())];
  if (titles.length === 0) return undefined;

  const exact: IntentPlan = JSON.parse(JSON.stringify(plan));
  for (const i of exact.intents) {
    if (i.type !== BookIntent.RemoveBook) continue;
    i.targets = i.targets.map((t) => ({ ...t, name: titleByName.get(t.name) ?? t.name }));
  }
  const label = listJoin(titles);
  pendingConfirmations.put(userId, { plan: exact, label, cancelMessage: `Okay, ${label} ${titles.length === 1 ? 'stays' : 'stay'} in your library.` });

  const books = await loadLibrary(userId);
  const onShelves = books.filter((b) => titles.includes(b.title) && b.shelves.length > 0).length > 0;
  const question = `Remove ${label} from your library?${onShelves ? ` ${titles.length === 1 ? 'It comes' : 'They come'} off your shelves too.` : ''}`;
  const reason = 'Your reading history, notes and review stay, and you can add it back any time.';
  return confirmationResponse(requestId, message, question, titles.length === 1 ? 'Yes, remove it' : 'Yes, remove them', reason);
}

/** "I've added X ... as Want to Read. I've marked X as Reading." reads as one step. */
export function tidyReply(message: string): string {
  if (typeof message !== 'string') return message;
  return message
    .replace(
      // Authors can carry initials ("Ursula K. Le Guin"), so the "by" part may hold periods.
      /I've added (.+?)( by [^\n]+?)? to your library as Want to Read\. I've marked \1 as ([A-Za-z ]+?)\.( Congratulations on finishing it!)?/g,
      (_m, title: string, by: string | undefined, status: string, congrats: string | undefined) => `I've added ${title}${by ?? ''} to your library as ${status}.${congrats ?? ''}`,
    )
    // Squeeze doubled spaces only; line breaks carry lists and paragraphs.
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** After a high rating of a book that isn't marked Finished: "Want me to mark it Finished?" */
export async function followUpOffer(userId: string, plan: IntentPlan, message: string): Promise<FollowUpOffer | undefined> {
  if (/\b(finish|finished|read it|reading|started|dnf|gave up|status)\b/i.test(message)) return undefined;
  const rated = plan.intents.find((i) => i.type === BookIntent.RateBook && Number(i.parameters?.find((p) => p.type === IntentParameterType.Rating)?.value) >= 4);
  const title = rated?.targets?.[0]?.name;
  if (!title) return undefined;
  const book = (await loadLibrary(userId)).find((b) => b.title === title);
  if (!book || book.status === 'FINISHED' || book.status === 'DID_NOT_FINISH') return undefined;
  return {
    question: `It's marked ${STATUS_LABEL[book.status]}; want me to mark it Finished?`,
    label: book.title,
    cancelMessage: `Okay, ${book.title} stays as ${STATUS_LABEL[book.status]}.`,
    run: async () => {
      await updateWork(userId, book._id, { status: 'FINISHED' });
      return `I've marked ${book.title} as Finished.`;
    },
  };
}
