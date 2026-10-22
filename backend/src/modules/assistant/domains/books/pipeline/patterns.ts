// The words that decide what a message asked for. Kept together so the planner checks,
// grounding and replies agree.

/** "no, I meant Piranesi" -- the reply owns the mistake. */
export const CORRECTION = /\b(i said|i meant|wrong (book|one)|not that one|wait,? no|that'?s wrong|no,? i (meant|said)|didn'?t ask)\b/i;

export const LOOKS_LIKE_QUESTION =
  /\?\s*$|^(what|whats|what's|how|is|are|should|which|why|does|do|did|can|could|would|who|when|where|any|have)\b/i;

/** The model's own short replies worth keeping as they are: refusals, "didn't catch that". */
export const KEEP_MODEL_REPLY = /\b(can'?t|cannot|didn'?t catch|not sure what|rephrase)\b/i;

/** Words that mean "do something" (as opposed to asking). */
export const EXPLICIT_ACTION =
  /\b(add|put|mark|set|move|remove|delete|rate|review|note|jot|create|make|start|started|finish|finished|dnf|drop|take|save|log|change|update|clear)\b/i;

export const RECOMMEND_ASK =
  /\b(recommend|suggest|what should i read|what to read|read next|next read|something (like|to read|new)|anything like|books? like|similar to|in the mood for)\b/i;

/** An answer-mode reply claiming it changed something; it can't have. */
export const CLAIMS_ACTION =
  /\bI(?:'ve| have)?\s+(?:just\s+|now\s+|also\s+)?(?:added|removed|marked|rated|reviewed|created|deleted|updated|put|moved|set|changed|saved|noted|shelved)\b/i;

const STATUS_WORDS =
  /\b(start\w*|began|begin\w*|reading|read|finish\w*|done|complete\w*|dnf|did ?n[o']?t finish|gave up|give up|abandon\w*|drop\w*|quit|stopped|want to read|tbr|to read|later|backlog|paus\w*|on hold|status|mark\w*|re-?read\w*|picked up)\b/i;
const RATE_WORDS =
  /\b(rate|rated|rating|stars?|\d+(\.\d)?\s*\/\s*(5|10)|out of (5|10)|score|review|reviewed|loved|hated|liked|disliked|amazing|masterpiece|meh|terrible)\b|\b[1-5]\s*(stars?)?\b/i;

/** Did the message ask for this kind of change at all? */
export function wasAskedFor(intentType: string, message: string): boolean {
  const m = message.toLowerCase();
  switch (intentType) {
    case 'RemoveBook':
      return /\b(remove|delete|get rid of|take .+ out of (my )?library|out of my library|from my library|don'?t own|no longer own|sold|gave away)\b/.test(m);
    case 'DeleteReview':
      return /\b(delete|remove|clear|erase|scrap|undo)\b[^.?!]*\b(review|rating|stars?)\b|\b(review|rating)\b[^.?!]*\b(delete|remove|clear)\b/.test(m);
    case 'SetStatus':
    case 'StartBook':
    case 'FinishBook':
    case 'DnfBook':
      return STATUS_WORDS.test(m);
    case 'RateBook':
    case 'ReviewBook':
      return RATE_WORDS.test(m);
    case 'CreateShelf':
      return /\b(shelf|shelves|collection|list|category)\b/.test(m) && /\b(create|make|new|start|add|set up)\b/.test(m);
    case 'OrganizeShelf':
      return /\b(shelf|shelves|collection|list|on|onto|to|into|in|off|from|out of)\b/.test(m) && /\b(put|add|move|place|file|take|remove|shelve|drop|stick|throw|toss)\b/.test(m);
    case 'AddNote':
      return /\b(note|notes|jot|remember that|write down|save (this|that)|memo)\b/.test(m);
    case 'AddBook':
      return /\b(add|put|save|track|bought|buy|got|get|picked up|own|borrowed|start\w*|finish\w*|reading|read|want|rate|rated|shelf|tbr|list|library)\b/.test(m);
    default:
      return true;
  }
}

/** "5 stars", "4/5", "9/10", "4 out of 5", "a 3" -> { value, scale }. */
export function statedScore(message: string): { value: number; scale: number } | undefined {
  const m = message.toLowerCase();
  const slash = m.match(/\b(\d+(?:\.\d+)?)\s*(?:\/|out of)\s*(5|10)\b/);
  if (slash) return { value: Number(slash[1]), scale: Number(slash[2]) };
  const stars = m.match(/\b(\d+(?:\.\d+)?)\s*stars?\b/) ?? m.match(/\b(one|two|three|four|five)\s+stars?\b/);
  if (stars) {
    const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
    return { value: words[stars[1]!] ?? Number(stars[1]), scale: 5 };
  }
  const rated = m.match(/\b(?:rate|rated|rating|give|gave|score)\b[^.?!\d]{0,40}?\b(\d+(?:\.\d+)?)\b/);
  if (rated) {
    const value = Number(rated[1]);
    return { value, scale: value > 5 ? 10 : 5 };
  }
  return undefined;
}

/** "it", "that one", "this book"... */
export const POINTS_BACK = /^(it|that|this|that one|this one|that book|this book|the book|the one|same one|same book)$/i;
export const MENTIONS_POINTER = /\b(it|that one|this one|that book|this book|the book)\b/i;
