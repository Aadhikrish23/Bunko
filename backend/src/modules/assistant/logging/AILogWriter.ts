import fs from "fs";
import path from "path";
import { LoggingConfig } from "./LoggingConfig";
import { coreLog } from "./coreLog";

export class AILogWriter {
  /**
   * Writes log content to a file inside the appropriate date directory.
   * Silently handles errors but prints to console on failure.
   */
  static writeLog(dateFolder: string, filename: string, content: string): void {
    if (!LoggingConfig.WRITE_TRACE_FILES) return;
    const targetDir = path.join(LoggingConfig.LOGS_BASE_DIR, dateFolder);
    const targetPath = path.join(targetDir, filename);

    try {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      fs.writeFileSync(targetPath, content, "utf8");
    } catch (error) {
      coreLog.error(`[AILogWriter] Failed to write log file to ${targetPath}:`, error);
    }
  }
}
