import type { AIRequestContext } from '../../../conversation/AIRequestContext';

/** Marks an answer request, so the test model can tell it from a planning one. */
export const ANSWER_PROMPT_MARKER = '[[ANSWER MODE]]';

/** A plain-text answer to a book question, written like a well-read friend. Changes nothing. */
export function buildAnswerPrompt(question: string, context: AIRequestContext): string {
  const books = context.library?.books.slice(0, 60).map((b) => `${b.title} (${b.status})`).join('; ') || '(none)';
  const convo = (context.recentExchanges ?? []).slice(-3).map((e) => `Reader: ${e.user}\nAssistant: ${e.assistant}`).join('\n') || '(none)';
  return `${ANSWER_PROMPT_MARKER}
You are the assistant in Bunko, a reading journal, and a well-read friend. Answer the reader's question directly in 2-4 short sentences of plain text (no headings, no JSON; a short list only if it really helps).
- Be accurate. Never invent books, authors, plot points, awards or publication details; if you're not sure, say so briefly rather than guess.
- No spoilers beyond the premise unless the reader asks for them.
- You can't see prices, stores or availability, and you can't change anything in this reply: never say you added, marked, rated or saved anything.
- You may use the reader's library for context (what they loved, what's on their list), but answer the question they asked.

Reader's books: ${books}
${context.facts ? `\nFacts from Bunko's records (correct; don't contradict them):\n${context.facts}\n` : ''}
Recent conversation:
${convo}

Question: ${question}

Answer:`;
}
