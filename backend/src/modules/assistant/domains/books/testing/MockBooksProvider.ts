import type { AIProvider } from '../../../providers/AIProvider';
import type { AIRequestContext } from '../../../conversation/AIRequestContext';
import type { IntentPlan } from '../../../intent/IntentPlan';
import type { AIIntent } from '../../../intent/AIIntent';
import { IntentParameterType } from '../../../intent/IntentParameterType';
import { BookIntent } from '../intent/BookIntent';
import { parseCommands } from '../conversation/quickCommands';
import { snapshotTitles } from '../data/library';
import { LOOKS_LIKE_QUESTION, RECOMMEND_ASK } from '../pipeline/patterns';

/**
 * AI_PROVIDER=mock (T-103): a deterministic stand-in for the model, for API tests and local
 * work without a key. It reads plain commands the way the fast path does, maps questions and
 * recommendation asks, and answers questions with a fixed sentence. Never used in production.
 */
export class MockBooksProvider implements AIProvider {
  async plan(request: string, context: AIRequestContext): Promise<IntentPlan> {
    const requestId = context.toolContext.requestId ?? 'mock';
    const text = request.trim();
    const intents: AIIntent[] = parseCommands(text, snapshotTitles(context.library)) ?? [];
    if (intents.length === 0) {
      const ask = (type: string, value: string): AIIntent => ({ type, confidence: 1, targets: [], parameters: [{ type: IntentParameterType.Text, value }] });
      if (RECOMMEND_ASK.test(text)) intents.push(ask(BookIntent.RecommendBook, text));
      else if (/\b(my|i|i've|i'm)\b/i.test(text) && LOOKS_LIKE_QUESTION.test(text)) intents.push(ask(BookIntent.LibraryQuestion, text));
      else if (LOOKS_LIKE_QUESTION.test(text)) intents.push(ask(BookIntent.AskQuestion, ''));
      else intents.push(ask(BookIntent.AskQuestion, "I didn't catch that. What would you like to do?"));
    }
    return { id: requestId, requestId, intents };
  }

  async answer(question: string): Promise<string> {
    return `Mock answer about: ${question}`;
  }
}
