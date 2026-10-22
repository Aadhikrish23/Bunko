import { AIToolContext } from "./AIToolContext";
import { AIToolResult } from "./AIToolResult";

export interface AITool<TInput = unknown, TOutput = unknown> {
  readonly category: string;
  readonly name: string;
  readonly description: string;

  execute(
    input: TInput,
    context: AIToolContext,
  ): Promise<AIToolResult<TOutput>>;
}
