import type { AIProvider } from '../../../providers/AIProvider';
import type { AIRequestContext } from '../../../conversation/AIRequestContext';
import type { Capability } from '../../../planning/Capability';
import type { IntentPlan } from '../../../intent/IntentPlan';
import { AIQuotaError } from '../../../runtime/errors/AIProviderUnavailableError';
import { AppError } from '../../../../../lib/app-error';
import { countGeneration } from '../../../../ai/ai.service';

/**
 * Bunko's policy around whichever provider is configured (SRS §20.6): each call to the model
 * counts toward the reader's daily allowance shared with the other generated features, so
 * messages answered from the reader's own data, without the model, cost nothing. Consent is
 * checked earlier, on the route.
 */
export class GuardedProvider implements AIProvider {
  constructor(private readonly inner: AIProvider) {}

  async plan(request: string, context: AIRequestContext, capabilities: Capability[]): Promise<IntentPlan> {
    await this.charge(context.toolContext.userId);
    return this.inner.plan(request, context, capabilities);
  }

  async answer(question: string, context: AIRequestContext): Promise<string> {
    await this.charge(context.toolContext.userId);
    return this.inner.answer(question, context);
  }

  private async charge(userId: string): Promise<void> {
    try {
      await countGeneration(userId);
    } catch (err) {
      // The core turns AI_QUOTA into a LIMITED reply rather than an error.
      if (err instanceof AppError && err.code === 'RATE_LIMITED') throw new AIQuotaError(err.message, err);
      throw err;
    }
  }
}
