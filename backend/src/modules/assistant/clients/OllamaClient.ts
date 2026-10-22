import axios from "axios";
import AIConfig from "../config/AIConfig";
import { AIProviderUnavailableError, isUnreachable } from "../runtime/errors/AIProviderUnavailableError";
import { coreLog } from "../logging/coreLog";

export class OllamaClient {
  private readonly baseUrl = AIConfig.ollamaBaseUrl;
  private readonly model = AIConfig.ollamaModel;
  private readonly timeout = AIConfig.ollamaTimeout;

  /**
   * Sends prompt to Ollama generate endpoint and returns the raw output string.
   */
  async generate(prompt: string): Promise<string> {
    const isDev = process.env.NODE_ENV !== "production";
    const startTime = Date.now();

    try {
      const response = await axios.post(
        `${this.baseUrl}/api/generate`,
        {
          model: this.model,
          prompt,
          format: "json",
          stream: false,
        },
        {
          timeout: this.timeout,
        },
      );

      const endTime = Date.now();
      const localDuration = endTime - startTime;

      if (!response) {
        throw new Error("Invalid HTTP response: Empty response from Ollama.");
      }

      if (response.status !== 200) {
        throw new Error(`Ollama returned a non-200 status code: ${response.status} ${response.statusText}`);
      }

      if (!response.data) {
        throw new Error("Invalid HTTP response: Missing response data from Ollama.");
      }

      const { response: modelResponse, total_duration } = response.data;

      if (typeof modelResponse !== "string") {
        throw new Error("Ollama response did not contain a valid 'response' field.");
      }

      if (isDev) {
        const responseDuration = typeof total_duration === "number"
          ? `${Math.round(total_duration / 1000000)}ms`
          : "N/A";
        coreLog.debug(`[OllamaClient] Selected Model: ${this.model}`);
        coreLog.debug(`[OllamaClient] Request Duration: ${localDuration}ms`);
        coreLog.debug(`[OllamaClient] Response Duration: ${responseDuration}`);
        coreLog.debug(`[OllamaClient] Response Length: ${modelResponse.length}`);
      }

      return modelResponse;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        if (error.code === "ECONNABORTED") {
          throw new AIProviderUnavailableError("Ollama request timed out. Please check if Ollama is responsive.", error);
        }
        if (error.code === "ECONNREFUSED") {
          throw new AIProviderUnavailableError(`Ollama is not running. Connection refused at ${this.baseUrl}. Please start the Ollama service.`, error);
        }
        if (isUnreachable(error)) {
          throw new AIProviderUnavailableError(`Ollama is unreachable at ${this.baseUrl} (${error.code}).`, error);
        }
        if (error.response) {
          throw new Error(`Ollama returned a non-200 HTTP response status: ${error.response.status}. Likely caused by an invalid model or prompt config.`);
        }
        throw new Error(`Failed to communicate with Ollama: ${error.message}`);
      }
      throw error;
    }
  }
}

export default new OllamaClient();
