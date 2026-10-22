import { coreLog } from "../logging/coreLog";
const aiProvider = process.env.AI_PROVIDER || "ollama";

// This file is imported at server startup (well before any request exists),
// so it must never throw -- an installation with no AI provider configured
// at all (e.g. a fresh packaged install before the user has set anything
// up) still needs auth/library/launcher/etc. to work. Missing config is
// logged here and surfaced as a normal, catchable error only when an actual
// chat request tries to use the misconfigured provider (see OllamaClient /
// NvidiaNimClient), the same lazy-validation pattern used elsewhere
// (steamWebApiService.getApiKey(), atlasConnection.getAtlasConnection()).
if (aiProvider !== "ollama" && aiProvider !== "nvidia") {
  coreLog.warn(
    `[AIConfig] AI_PROVIDER must be "ollama" or "nvidia", got "${aiProvider}" -- AI features will be unavailable.`,
  );
}

if (aiProvider === "ollama") {
  if (!process.env.OLLAMA_BASE_URL || !process.env.OLLAMA_MODEL) {
    coreLog.warn(
      "[AIConfig] OLLAMA_BASE_URL/OLLAMA_MODEL are not set -- AI chat will fail until they're configured.",
    );
  }
}

if (aiProvider === "nvidia") {
  if (!process.env.NVIDIA_API_KEY || !process.env.NVIDIA_MODEL) {
    coreLog.warn(
      "[AIConfig] NVIDIA_API_KEY/NVIDIA_MODEL are not set -- AI chat will fail until they're configured.",
    );
  }
}

export const AIConfig = {
  aiProvider: aiProvider as "ollama" | "nvidia",

  ollamaBaseUrl: process.env.OLLAMA_BASE_URL as string,
  ollamaModel: process.env.OLLAMA_MODEL as string,
  ollamaTimeout: process.env.OLLAMA_TIMEOUT
    ? parseInt(process.env.OLLAMA_TIMEOUT, 10)
    : 90000,

  nvidiaApiKey: process.env.NVIDIA_API_KEY as string,
  nvidiaModel: process.env.NVIDIA_MODEL as string,
  nvidiaBaseUrl: process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1",
  // 30s: the packaged app has no .env, and a 60s default once left a tester waiting a full minute.
  nvidiaTimeout: process.env.NVIDIA_TIMEOUT
    ? parseInt(process.env.NVIDIA_TIMEOUT, 10)
    : 30000,
  /**
   * The plain-text answer call. There's already a short reply from the planner to fall back on,
   * so it isn't worth a long wait.
   */
  nvidiaAnswerTimeout: process.env.NVIDIA_ANSWER_TIMEOUT ? parseInt(process.env.NVIDIA_ANSWER_TIMEOUT, 10) : 20000,
  /** Tried in order when the main model is slow or failing (same key and endpoint). */
  nvidiaFallbackModels: (process.env.NVIDIA_FALLBACK_MODELS ?? "nvidia/nemotron-3-super-120b-a12b,openai/gpt-oss-20b")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean),
  /** How long the first model gets before the next one is tried (healthy replies take 1-5s). */
  nvidiaPrimaryTimeout: process.env.NVIDIA_PRIMARY_TIMEOUT ? parseInt(process.env.NVIDIA_PRIMARY_TIMEOUT, 10) : 6000,
};

export default AIConfig;
