import { IntentPlan } from "../intent/IntentPlan";

interface PendingConfirmation {
  /** The plan to run on "yes" -- or `run`, for actions outside the planner (deleting a collection). */
  plan?: IntentPlan;
  run?: () => Promise<string>;
  /** The collection an offer was about, so "yeah, and hollow knight too" goes into it. */
  collection?: string;
  /** What "no" says, when "Okay, I kept X in your library" doesn't fit. */
  cancelMessage?: string;
  /** What the question named, e.g. "Red Dead Redemption 2". */
  label: string;
  expiresAt: number;
}

const TTL_MS = 5 * 60 * 1000;

/**
 * Destructive requests (removing games) wait here for the user's "yes".
 * One pending action per user; it is consumed by the very next message.
 */
class PendingConfirmationStore {
  private readonly pending = new Map<string, PendingConfirmation>();

  put(userId: string, value: Omit<PendingConfirmation, "expiresAt">) {
    this.pending.set(userId, { ...value, expiresAt: Date.now() + TTL_MS });
  }

  has(userId: string): boolean {
    const value = this.pending.get(userId);
    return !!value && value.expiresAt > Date.now();
  }

  /** Returns and clears the pending action, if it hasn't expired. */
  take(userId: string): PendingConfirmation | null {
    const value = this.pending.get(userId);
    this.pending.delete(userId);
    return value && value.expiresAt > Date.now() ? value : null;
  }
}

/** "yes", "yeah do it", "ok sure", "yes please", "bet", "sounds good" -- any run of yes-words. */
const YES_WORD = "(?:y|ya|ye|yeh|yah|yes|yea|yeah|yep|yup|sure|ok|okay|k|confirm|do it|go ahead|go for it|please|pls|plz|bet|sounds good|why not|absolutely|definitely|yes please|remove it|delete it|add it|mark it|thanks|ty|cool|alright|alr|fine|sure thing|of course|yessir|yes sir|lets go|let's go)";
const YES = new RegExp(`^${YES_WORD}(?:[\\s,!.]+${YES_WORD})*[\\s.!]*$`, "i");
const NO = /^(n|no|nope|nah|cancel|stop|don'?t|keep it|never ?mind|nvm|forget it|no,? (keep it|cancel|thanks|don'?t))[.!]*$/i;

export const isConfirmReply = (text: string) => YES.test(text.trim());
export const isCancelReply = (text: string) => NO.test(text.trim());

export default new PendingConfirmationStore();

/**
 * "yeah do it, and hollow knight too. also put ds3 in there": a yes to the pending offer
 * plus more. Returns the rest of the message, or undefined when it isn't that shape.
 */
// "ya and hollow knight too", "yes add those, and hollow knight too": the yes, plus "add those"
// (which only repeats the yes), then the extra.
const YES_THEN = /^(?:y|ya|yea|yeah|yes|yep|yup|ye|sure|ok|okay|bet|go ahead|do it)\b[\s,.!]*(?:(?:do it|please|pls|go ahead|sure|(?:add|put) (?:those|them|em|'em|both|all of them)(?: in)?)\b[\s,.!]*)*/i;
export function yesAndMore(text: string): string | undefined {
  const match = text.trim().match(YES_THEN);
  if (!match || match[0].length === 0) return undefined;
  const rest = text.trim().slice(match[0].length).replace(/^(and|also|plus|then)\b[\s,]*/i, "").trim();
  return rest.split(/\s+/).length >= 2 ? rest : undefined;
}

/**
 * A "no" to a question we just asked, said casually: "eh nvm keep it, i might emulate it".
 * Only used while a confirmation is pending; on its own "no i meant celeste" is a correction.
 */
const LOOSE_NO = /^(?:(?:eh|uh|um|hmm|wait|actually|oh|ah|lol)[,!.]?\s+)*(?:n|no|nope|nah|nvm|never ?mind|cancel|stop|don'?t|keep it|leave it|forget it|scratch that)\b/i;
export const isLooseCancel = (text: string) => LOOSE_NO.test(text.trim());

/**
 * "nah. where did i leave off in disco elysium again": a no to the pending offer, then a new
 * question. Returns the new part, or undefined when the message is only a no ("nah keep it").
 */
const NO_THEN = /^(?:(?:eh|uh|um|hmm|oh|ah)[,!.]?\s+)*(?:no|nope|nah|nvm|never ?mind)(?:,?\s+(?:thanks|thx|ty))?[.!,;]+\s*/i;
export function noAndMore(text: string): string | undefined {
  const match = text.trim().match(NO_THEN);
  if (!match) return undefined;
  const rest = text.trim().slice(match[0].length).replace(/^(and|also|but|so)\b[\s,]*/i, "").trim();
  return rest.split(/\s+/).length >= 3 ? rest : undefined;
}
