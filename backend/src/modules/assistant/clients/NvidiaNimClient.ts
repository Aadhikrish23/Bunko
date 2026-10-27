import axios from "axios";
import AIConfig from "../config/AIConfig";
import { AIProviderUnavailableError, AIQuotaError, AI_DAILY_LIMIT_MESSAGE, AI_SHARED_LIMIT_MESSAGE, AI_NOT_ENABLED_MESSAGE, isUnreachable } from "../runtime/errors/AIProviderUnavailableError";
import { coreLog } from "../logging/coreLog";

/** How long a model that just timed out or failed is skipped. */
const UNHEALTHY_FOR_MS = 5 * 60 * 1000;

/**
 * NVIDIA's hosted API is shared and sometimes queues requests for a minute or more
 * (observed: median 1.5s one day, 18s with 60-90s tails the next). Each call tries the
 * primary model with a short budget, then falls back to other models on the same key.
 * A model that just failed is skipped for a while, so the next messages don't wait on it.
 */
export class NvidiaNimClient {
  private readonly baseUrl = AIConfig.nvidiaBaseUrl;
  private readonly apiKey = AIConfig.nvidiaApiKey;
  private readonly models = [AIConfig.nvidiaModel, ...AIConfig.nvidiaFallbackModels].filter(
    (m, i, all): m is string => !!m && all.indexOf(m) === i,
  );
  /** Total time a call may take, across all models. */
  private readonly timeout = AIConfig.nvidiaTimeout;
  /** Time the first model gets before the next one is tried. */
  private readonly firstTryTimeout = AIConfig.nvidiaPrimaryTimeout;
  private readonly unhealthyUntil = new Map<string, number>();

  /**
   * Sends prompt to NVIDIA NIM's OpenAI-compatible chat completions endpoint
   * and returns the raw text output (mirrors OllamaClient.generate's contract).
   */
  async generate(prompt: string, totalTimeoutMs: number = this.timeout): Promise<string> {
    const deadline = Date.now() + totalTimeoutMs;
    const healthy = this.models.filter((m) => (this.unhealthyUntil.get(m) ?? 0) <= Date.now());
    // Everything recently failed: try them all again rather than give up.
    const order = healthy.length > 0 ? healthy : this.models;

    let lastError: unknown;
    for (let i = 0; i < order.length; i++) {
      const remaining = deadline - Date.now();
      if (remaining <= 500) break;
      const isLast = i === order.length - 1;
      // The last model may use the whole remaining budget; earlier ones get a short try.
      const budget = isLast ? remaining : Math.min(this.firstTryTimeout, remaining);
      try {
        const content = await this.call(order[i]!, prompt, budget);
        this.unhealthyUntil.delete(order[i]!);
        return content;
      } catch (error) {
        lastError = error;
        // A bad key or rate limit applies to every model; don't hammer the others.
        if (error instanceof AIQuotaError || (error instanceof Error && /401|429/.test(error.message))) throw error;
        this.unhealthyUntil.set(order[i]!, Date.now() + UNHEALTHY_FOR_MS);
        if (process.env.NODE_ENV !== "production") {
          coreLog.debug(`[NvidiaNimClient] ${order[i]} failed (${error instanceof Error ? error.message : error}); trying the next model.`);
        }
      }
    }
    throw lastError ?? new AIProviderUnavailableError("NVIDIA NIM request timed out. Please try again.");
  }

  private async call(model: string, prompt: string, timeout: number): Promise<string> {
    const isDev = process.env.NODE_ENV !== "production";
    const startTime = Date.now();

    try {
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0,
          max_tokens: 1024,
          stream: false,
          // Nemotron models have a hybrid reasoning mode that, left on, spends thousands of
          // characters "thinking out loud" before ever emitting JSON -- often exceeding
          // max_tokens before it gets there (observed: 45-60s responses, some truncated
          // to pure reasoning prose with no JSON at all). Structured intent extraction
          // needs the direct answer, not a visible chain of thought, so it's turned off.
          // Models without the switch ignore it. gpt-oss (the fallback model) uses its
          // own reasoning_effort knob instead of chat_template_kwargs and defaults to
          // medium, which showed the same symptom on off-topic prompts (R5-04: a
          // question with no good book-domain answer gave it the most to "reason"
          // about, burning the whole budget before replying or timing out outright).
          chat_template_kwargs: { thinking: false },
          reasoning_effort: "low",
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          timeout,
        },
      );

      const localDuration = Date.now() - startTime;

      if (!response || response.status !== 200 || !response.data) {
        throw new Error("Invalid HTTP response: Empty response from NVIDIA NIM.");
      }

      const content = response.data?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        throw new Error("NVIDIA NIM response did not contain a valid message content field.");
      }

      if (isDev) {
        coreLog.debug(`[NvidiaNimClient] Selected Model: ${model}`);
        coreLog.debug(`[NvidiaNimClient] Request Duration: ${localDuration}ms`);
        coreLog.debug(`[NvidiaNimClient] Response Length: ${content.length}`);
      }

      return content;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        if (error.code === "ECONNABORTED") {
          throw new AIProviderUnavailableError("NVIDIA NIM request timed out. Please try again.", error);
        }
        if (isUnreachable(error)) {
          throw new AIProviderUnavailableError(`NVIDIA NIM is unreachable (${error.code}) -- most likely no internet connection.`, error);
        }
        if (error.response) {
          const status = error.response.status;
          // keygate's own refusals (packaged app): say what happened, plainly.
          const gateCode = (error.response.data as { error?: { code?: string } } | undefined)?.error?.code;
          if (gateCode === "daily_limit") throw new AIQuotaError(AI_DAILY_LIMIT_MESSAGE, error);
          if (gateCode === "project_daily_limit") throw new AIQuotaError(AI_SHARED_LIMIT_MESSAGE, error);
          if (gateCode === "bad_token" || gateCode === "no_token") throw new AIQuotaError(AI_NOT_ENABLED_MESSAGE, error);
          // A rejected key or a busy service is "unavailable", which the API turns into a clear
          // reply -- not an unexplained server error.
          if (status === 401 || status === 403) {
            throw new AIProviderUnavailableError("NVIDIA NIM is not configured: the API key was rejected (check NVIDIA_API_KEY).", error);
          }
          if (status === 429) {
            throw new AIProviderUnavailableError("NVIDIA NIM is busy (429 rate limit); try again shortly.", error);
          }
          throw new Error(`NVIDIA NIM returned a non-200 HTTP response status: ${status} for ${model}. Likely caused by an invalid model or request config.`);
        }
        throw new Error(`Failed to communicate with NVIDIA NIM: ${error.message}`);
      }
      throw error;
    }
  }
}

export default new NvidiaNimClient();
