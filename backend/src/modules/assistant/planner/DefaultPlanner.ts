import { AIPlanner } from "../sdk/AIPlanner";
import { AIToolContext } from "../sdk/AIToolContext";
import { AIPlan } from "../types/AIPlan";
import crypto from "crypto";

export class DefaultPlanner implements AIPlanner {
  async plan(
    request: string,
    context: AIToolContext
  ): Promise<AIPlan> {
    // Suppress unused parameter warnings until Phase 3
    void request;
    void context;

    return {
      id: crypto.randomUUID(),
      steps: [],
    };
  }
}