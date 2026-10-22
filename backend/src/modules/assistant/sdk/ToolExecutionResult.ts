export interface ToolExecutionResult<T = unknown> {
  readonly success: boolean;
  readonly status?: string;
  readonly message?: string;
  readonly warnings?: string[];
  readonly errors?: string[];
  readonly metadata?: Record<string, unknown>;
  readonly data?: T;
  readonly error?: string;
}
