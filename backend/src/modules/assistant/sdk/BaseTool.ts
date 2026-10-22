import { AITool } from "./AITool";
import { AIToolContext } from "./AIToolContext";
import { ToolExecutionResult } from "./ToolExecutionResult";

export abstract class BaseTool<TInput = unknown, TOutput = unknown>
  implements AITool<TInput, TOutput>
{
  abstract readonly category: string;

  abstract readonly name: string;

  abstract readonly description: string;

  abstract execute(
    input: TInput,
    context: AIToolContext
  ): Promise<ToolExecutionResult<TOutput>>;

  /**
   * Helper to return standard success outcome.
   */
  success(
    data: TOutput,
    message?: string,
    metadata?: Record<string, unknown>
  ): ToolExecutionResult<TOutput> {
    return {
      success: true,
      status: "SUCCESS",
      message,
      metadata,
      data,
    };
  }

  /**
   * Helper to return standard failure outcome.
   */
  failure(
    error: string,
    errors?: string[],
    metadata?: Record<string, unknown>
  ): ToolExecutionResult<TOutput> {
    return {
      success: false,
      status: "FAILED",
      error,
      errors: errors || [error],
      metadata,
    };
  }

  /**
   * Helper to return warning outcomes.
   */
  warning(
    message: string,
    warnings?: string[],
    data?: TOutput
  ): ToolExecutionResult<TOutput> {
    return {
      success: true,
      status: "SUCCESS_WITH_WARNINGS",
      message,
      warnings: warnings || [message],
      data,
    };
  }
}
export default BaseTool;