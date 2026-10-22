export class EntityResolutionError extends Error {
  readonly code: string;
  readonly recoverable: boolean;
  readonly metadata?: Record<string, unknown>;
  readonly cause?: unknown;

  constructor(
    message: string,
    code = "ENTITY_RESOLUTION_ERROR",
    recoverable = false,
    metadata?: Record<string, unknown>,
    cause?: unknown
  ) {
    super(message);
    this.name = "EntityResolutionError";
    this.code = code;
    this.recoverable = recoverable;
    this.metadata = metadata;
    this.cause = cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
