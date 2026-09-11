// Error codes per docs/API_SPEC.md §4 (the minimum set every client can rely on).
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FILE'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export const ERROR_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  FILE_TOO_LARGE: 413,
  UNSUPPORTED_FILE: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export interface ErrorDetail {
  field: string;
  issue: string;
}

// Thrown by controllers/services; caught exactly once by errorHandler
// (middleware/error-handler.ts), which is the only place that shapes an
// error response (CODING_STANDARDS.md §5).
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: ErrorDetail[];

  constructor(code: ErrorCode, message: string, statusCode: number = ERROR_STATUS[code], details?: ErrorDetail[]) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}
