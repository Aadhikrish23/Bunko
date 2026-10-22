import { AIExecutor } from "./sdk/AIExecutor";
import { AIProvider } from "./providers/AIProvider";
import { AIToolRegistry } from "./sdk/AIToolRegistry";
import { ContextBuilder } from "./context/ContextBuilder";
import { CapabilityRegistry } from "./planning/CapabilityRegistry";
import { AIRuntime } from "./AIRuntime";
import type { AIClientCapabilities } from "./sdk/AIToolContext";

export class AIService {
  private readonly runtime: AIRuntime;

  constructor(
    private readonly provider: AIProvider,
    private readonly executor: AIExecutor,
    private readonly toolRegistry: AIToolRegistry,
    private readonly contextBuilder: ContextBuilder,
    private readonly capabilityRegistry: CapabilityRegistry,
  ) {
    this.runtime = new AIRuntime(
      provider,
      executor,
      toolRegistry,
      contextBuilder,
      capabilityRegistry,
    );
  }

  async chat(userId: string, request: string, requestId: string, client?: AIClientCapabilities) {
    return this.runtime.chat(userId, request, requestId, client);
  }

  async reset(userId: string) {
    return this.runtime.reset(userId);
  }
}



