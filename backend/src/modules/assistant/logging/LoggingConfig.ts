import path from "path";

export const LoggingConfig = {
  // Base directory where AI logs will be stored
  LOGS_BASE_DIR: path.join(__dirname, "../../../../logs/ai"),

  // Per-request trace files contain the prompt, which includes the reader's
  // library and messages, so they're written only when AI_TRACE_LOGS=true.
  WRITE_TRACE_FILES: process.env.AI_TRACE_LOGS === "true",

  // Maximum length of the request text snippet allowed in the log filename
  MAX_FILENAME_REQUEST_LENGTH: 30,

  // Keep console tracing concise
  CONSOLE_CONCISE: true,
};
