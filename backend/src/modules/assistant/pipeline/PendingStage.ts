import { IntentPlan } from "../intent/IntentPlan";
import pendingConfirmations, { isCancelReply, isConfirmReply, isLooseCancel, noAndMore, yesAndMore } from "../conversation/PendingConfirmationStore";
import type { RuntimeResponse } from "./Replies";
import { domainPack } from "../domain/activeDomain";

/** What the reply to a pending yes/no question turned out to be. */
export type PendingOutcome =
  | { kind: "none" }
  | { kind: "reply"; response: RuntimeResponse }
  /** "yeah do it, and hollow knight too": the offer ran; `rest` is handled as a new message. */
  | { kind: "more"; done: string; rest: string }
  /** "yes" to a planned removal or add: run that plan, already confirmed. */
  | { kind: "plan"; plan: IntentPlan };

/**
 * A removal or offer we asked about last turn: "yes" runs it, "no" drops it,
 * anything else drops it and is handled as a new request.
 */
export async function handlePending(userId: string, message: string): Promise<PendingOutcome> {
  const pending = pendingConfirmations.take(userId);
  if (!pending) return { kind: "none" };

  const rest = pending.run ? yesAndMore(message) : undefined;
  // Offers run outside the plan runner, so "undo" can't put them back: don't let it reach past them.
  if (pending.run && (isConfirmReply(message) || rest)) domainPack().undo.forget(userId);
  if (isConfirmReply(message) && pending.run) {
    return { kind: "reply", response: { success: true, message: await pending.run() } };
  }
  if (rest && pending.run) {
    const done = await pending.run();
    return { kind: "more", done, rest: pending.collection ? intoCollection(rest, pending.collection) : rest };
  }
  if (isConfirmReply(message) && pending.plan) {
    return { kind: "plan", plan: pending.plan };
  }
  const cancelled = pending.cancelMessage ?? (pending.run ? `Okay, I kept ${pending.label}.` : `Okay, I kept ${pending.label} in your library.`);
  // "nah. where did i leave off in disco elysium?": say no, then answer the question too.
  const after = noAndMore(message);
  if (after) return { kind: "more", done: cancelled, rest: after };
  if (isCancelReply(message) || isLooseCancel(message)) {
    return { kind: "reply", response: { success: true, status: "CANCELLED", message: cancelled } };
  }
  return { kind: "none" };
}

/** "hollow knight too. also put ds3 in there" after a collection offer -> "put hollow knight in Soulslikes. also put ds3 in there". */
export function intoCollection(rest: string, collection: string): string {
  const [first, ...others] = rest.split(/(?<=[.!;])\s+|\s+(?=also\b)/i);
  if (/^(put|add|throw|chuck|toss|move|remove|take|mark|rate|set|pause|drop|delete)\b/i.test(first!.trim())) return rest;
  const game = first!.replace(/\b(too|as well|also)\b/gi, "").replace(/[.!;,]+$/, "").trim();
  return [`put ${game} in ${collection}.`, ...others].join(" ");
}
