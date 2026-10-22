import AppError from "./CoreError";

export class AIRuntimeError extends AppError {
  readonly code: string;
  readonly recoverable: boolean;
  readonly metadata?: Record<string, unknown>;
  readonly cause?: unknown;

  constructor(
    message: string,
    code = "AI_RUNTIME_ERROR",
    recoverable = false,
    metadata?: Record<string, unknown>,
    cause?: unknown
  ) {
    super(message, 400);
    this.name = "AIRuntimeError";
    this.code = code;
    this.recoverable = recoverable;
    this.metadata = metadata;
    this.cause = cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

