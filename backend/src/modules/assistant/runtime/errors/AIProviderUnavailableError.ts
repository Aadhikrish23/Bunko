import { AIRuntimeError } from "./AIRuntimeError";

export const AI_OFFLINE_MESSAGE =
  "The AI assistant is offline right now. Check your internet connection and try again -- everything else in RoninArc keeps working.";

/** The model answered too slowly (its service is overloaded) -- not the user's connection. */
export const AI_SLOW_MESSAGE =
  "The AI model is taking too long to answer right now, so I stopped waiting. Simple requests like \"pause rdr2\" or \"rate hades 9\" still work instantly. Or try again in a minute.";

/** keygate (the key proxy the packaged app uses) said this install has used today's AI calls. */
export const AI_DAILY_LIMIT_MESSAGE =
  "You've used today's AI messages on this PC. They reset at midnight UTC (5:30 AM in India) -- everything else in RoninArc keeps working.";
/** All installs together used today's AI allowance. */
export const AI_SHARED_LIMIT_MESSAGE =
  "RoninArc's AI has used up today's shared allowance. It resets at midnight UTC (5:30 AM in India) -- everything else keeps working.";
/** keygate doesn't accept this install's token (revoked). */
export const AI_NOT_ENABLED_MESSAGE = "The AI assistant isn't enabled on this install. Everything else in RoninArc keeps working.";

/** The model can't be used right now for a reason the user should hear plainly (limits, access). */
export class AIQuotaError extends AIRuntimeError {
  constructor(message: string, cause?: unknown) {
    super(message, "AI_QUOTA", false, {}, cause);
    this.name = "AIQuotaError";
    this.statusCode = 429;
    this.status = "Error";
  }
}

/**
 * The LLM provider could not be reached at all (no network, refused, timed
 * out). Distinct from a bad response so the API can refuse gracefully with a
 * 503 instead of surfacing a raw transport error.
 */
export class AIProviderUnavailableError extends AIRuntimeError {
  constructor(detail: string, cause?: unknown) {
    super(detail, "AI_PROVIDER_UNAVAILABLE", true, {}, cause);
    this.name = "AIProviderUnavailableError";
    this.statusCode = 503;
    this.status = "Error";
  }
}

const UNREACHABLE_CODES = new Set([
  "ECONNREFUSED",
  "ECONNABORTED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
]);

/** True for axios errors where no response ever came back from the provider. */
export function isUnreachable(error: { code?: string; response?: unknown }): boolean {
  return !error.response && !!error.code && UNREACHABLE_CODES.has(error.code);
}
