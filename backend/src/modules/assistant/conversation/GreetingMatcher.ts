export type GreetingKind = "hello" | "thanks" | "howAreYou" | "capabilities";

const PHRASES: Record<GreetingKind, string[]> = {
  hello: [
    "hi", "hello", "hey", "hi there", "hello there", "hey there",
    "good morning", "good afternoon", "good evening",
  ],
  thanks: ["thanks", "thank you", "thx", "thanks a lot", "thank you so much", "many thanks"],
  howAreYou: ["how are you", "how are you doing", "how r u"],
  capabilities: ["help", "what can you do", "what can you help with", "what do you do"],
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Returns a greeting kind only when the WHOLE message is a greeting. Matching
 * substrings (the previous behaviour) hijacked real requests whose game title
 * merely contained "hi" -- "Launch Hitman", "Rate Thief 5 stars" -- and answered
 * them with a canned "Hello!" instead of acting.
 */
export function matchGreeting(request: string): GreetingKind | null {
  const text = normalize(request);
  if (!text) return null;
  for (const kind of Object.keys(PHRASES) as GreetingKind[]) {
    if (PHRASES[kind].includes(text)) return kind;
  }
  return null;
}


