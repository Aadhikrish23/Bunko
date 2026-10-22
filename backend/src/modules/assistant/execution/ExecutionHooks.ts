import { ExecutionContext } from "./ExecutionContext";
import { ExecutionStep } from "./ExecutionStep";
import { ExecutionStepResult } from "./ExecutionStepResult";
import { ExecutionResult } from "./ExecutionResult";

export interface ExecutionHooksSubscriber {
  beforeExecution?: (context: ExecutionContext) => void | Promise<void>;
  afterExecution?: (context: ExecutionContext, result: ExecutionResult) => void | Promise<void>;
  beforeStep?: (context: ExecutionContext, step: ExecutionStep) => void | Promise<void>;
  afterStep?: (context: ExecutionContext, step: ExecutionStep, result: ExecutionStepResult) => void | Promise<void>;
}

export class ExecutionHooks {
  private readonly subscribers: ExecutionHooksSubscriber[] = [];

  /**
   * Registers a plugin hook listener.
   */
  subscribe(subscriber: ExecutionHooksSubscriber): () => void {
    this.subscribers.push(subscriber);
    return () => {
      const idx = this.subscribers.indexOf(subscriber);
      if (idx !== -1) {
        this.subscribers.splice(idx, 1);
      }
    };
  }

  async triggerBeforeExecution(context: ExecutionContext): Promise<void> {
    for (const sub of this.subscribers) {
      if (sub.beforeExecution) {
        await sub.beforeExecution(context);
      }
    }
  }

  async triggerAfterExecution(context: ExecutionContext, result: ExecutionResult): Promise<void> {
    for (const sub of this.subscribers) {
      if (sub.afterExecution) {
        await sub.afterExecution(context, result);
      }
    }
  }

  async triggerBeforeStep(context: ExecutionContext, step: ExecutionStep): Promise<void> {
    for (const sub of this.subscribers) {
      if (sub.beforeStep) {
        await sub.beforeStep(context, step);
      }
    }
  }

  async triggerAfterStep(context: ExecutionContext, step: ExecutionStep, result: ExecutionStepResult): Promise<void> {
    for (const sub of this.subscribers) {
      if (sub.afterStep) {
        await sub.afterStep(context, step, result);
      }
    }
  }
}

export default new ExecutionHooks();
