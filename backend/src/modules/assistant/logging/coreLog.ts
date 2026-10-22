/**
 * The core's only console output. Per-request tracing (which can echo what the
 * user wrote) prints only with DEBUG_AI=true; warnings and errors always do.
 */
const debugEnabled = () => process.env.DEBUG_AI === "true";

export const coreLog = {
  debug(...args: unknown[]): void {
    if (debugEnabled()) console.debug(...args);
  },
  warn(...args: unknown[]): void {
    console.warn(...args);
  },
  error(...args: unknown[]): void {
    console.error(...args);
  },
};
