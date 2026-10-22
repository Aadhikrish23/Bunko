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
    if (process.env.MOCK_LLM === "true" && prompt.startsWith("[[ANSWER MODE]]")) {
      const question = (prompt.match(/\nQuestion: ([^\n]+)/) || [])[1] || "";
      return `Mock answer about: ${question}`;
    }

    if (process.env.MOCK_LLM === "true") {
      const match = prompt.match(/User Request:\s*\n([^\n]+)/);
      const query = match ? match[1]!.trim() : "";
      const queryLower = query.toLowerCase();
      coreLog.debug(`[OllamaClient Mock] Intercepted user query: "${query}"`);

      let responseText = "";

      if (queryLower === "asdfgh") {
        // Mimics a real-model failure seen in playtesting: a keyboard mash came
        // back as a status change on a game nobody mentioned. The runtime's
        // grounding check must refuse it.
        responseText = JSON.stringify({
          intents: [{ type: "SetStatus", targets: [{ type: "Game", name: "Hades" }], parameters: [{ type: "Status", value: "playing" }] }],
        });
      } else if (queryLower.startsWith("should i play elden ring")) {
        // Real-model failure from playtest round 7: a "which first?" question came back as a
        // status change. The runtime must answer it and change nothing.
        responseText = JSON.stringify({
          intents: [{ type: "SetStatus", targets: [{ type: "Game", name: "Elden Ring" }], parameters: [{ type: "Status", value: "playing" }] }],
        });
      } else if (queryLower.startsWith("what did i rate")) {
        responseText = JSON.stringify({
          intents: [{ type: "LibraryQuestion", targets: [], parameters: [{ type: "Text", value: query }] }],
        });
      } else if (
        queryLower.includes("recommend") ||
        queryLower.includes("suggest") ||
        queryLower.includes("what should i play")
      ) {
        responseText = JSON.stringify({
          intents: [{ type: "RecommendGame", targets: [], parameters: [{ type: "Text", value: query }] }],
        });
      } else if (queryLower.includes("launch")) {
        let bookName = "Fallout Shelter";
        if (queryLower.includes("elden ring")) {
          bookName = "Elden Ring";
        } else if (queryLower.includes("cyberpunk")) {
          bookName = "Cyberpunk 2077";
        } else if (queryLower.includes("unknown game")) {
          bookName = "Unknown Game";
        } else if (queryLower.includes("fallout") && !queryLower.includes("shelter")) {
          bookName = "Fallout";
        } else if (queryLower.includes("it")) {
          bookName = "it";
        }
        responseText = JSON.stringify({
          intents: [
            {
              type: "LaunchGame",
              targets: [{ type: "Game", name: bookName }],
              parameters: []
            }
          ]
        });
      } else if (queryLower.includes("complete")) {
        let bookName = "Fallout Shelter";
        if (queryLower.includes("cyberpunk")) {
          bookName = "Cyberpunk 2077";
        }
        responseText = JSON.stringify({
          intents: [
            {
              type: "CompleteGame",
              targets: [{ type: "Game", name: bookName }],
              parameters: []
            }
          ]
        });
      } else if (queryLower.startsWith("rate fallout shelter 9 ")) {
        // A rating with a casual comment, the way the real model sends it.
        responseText = JSON.stringify({
          intents: [{
            type: "RateGame",
            targets: [{ type: "Game", name: "Fallout Shelter" }],
            parameters: [{ type: "Rating", value: 9 }, { type: "Text", value: query.slice("rate fallout shelter 9 ".length) }],
          }],
        });
      } else if (queryLower.includes("rate") || queryLower.includes("review")) {
        let rating = 9;
        let text = "";
        let bookName = "Fallout Shelter";
        if (queryLower.includes("it")) {
          bookName = "it";
        }
        if (queryLower.includes("9")) {
          rating = 9;
        } else if (queryLower.includes("10")) {
          rating = 10;
        }
        if (queryLower.includes("review")) {
          text = "Great game!";
        }
        responseText = JSON.stringify({
          intents: [
            {
              type: "ReviewGame",
              targets: [{ type: "Game", name: bookName }],
              parameters: [
                { type: "Rating", value: rating },
                ...(text ? [{ type: "Text", value: text }] : [])
              ]
            }
          ]
        });
      } else if (queryLower.includes("soulslike collection")) {
        // What the real model sends for "make a soulslike collection".
        responseText = JSON.stringify({
          intents: [{ type: "CreateCollection", targets: [{ type: "Collection", name: "Soulslikes" }], parameters: [] }],
        });
      } else if (queryLower.includes("create") && queryLower.includes("collection")) {
        responseText = JSON.stringify({
          intents: [
            {
              type: "OrganizeCollection",
              targets: [{ type: "Collection", name: "RPG Collection" }],
              parameters: []
            }
          ]
        });
      } else if (queryLower.includes("add") && queryLower.includes("collection")) {
        let bookName = "Fallout Shelter";
        if (queryLower.includes("it")) {
          bookName = "it";
        }
        responseText = JSON.stringify({
          intents: [
            {
              type: "OrganizeCollection",
              targets: [
                { type: "Collection", name: "RPG Collection" },
                { type: "Game", name: bookName }
              ],
              parameters: []
            }
          ]
        });
      } else if (queryLower.includes("remove") && queryLower.includes("collection")) {
        responseText = JSON.stringify({
          intents: [
            {
              type: "OrganizeCollection",
              targets: [
                { type: "Collection", name: "RPG Collection" },
                { type: "Game", name: "Fallout Shelter" }
              ],
              parameters: []
            }
          ]
        });
      }

      // Rules for requests the chain above doesn't cover. Game names are picked
      // from the e2e catalog, defaulting to Fallout Shelter like the rules above.
      if (!responseText) {
        const KNOWN_GAMES = ["Fallout Shelter", "Cyberpunk 2077", "Elden Ring", "Hollow Knight", "Celeste", "Hades", "Stardew Valley", "Hitman"];
        const named = KNOWN_GAMES.find((t) => queryLower.includes(t.toLowerCase())) ?? "Fallout Shelter";
        const intent = (type: string, targets: unknown[] = [], parameters: unknown[] = []) => ({ type, targets, parameters });
        const statusMatch = queryLower.match(/\b(paused|pause|taking a break|playing|plan to play|dropped)\b/);
        const statusFor: Record<string, string> = {
          paused: "paused", pause: "paused", "taking a break": "paused", playing: "playing", "plan to play": "plan", dropped: "dropped",
        };

        if (queryLower.includes("buy")) {
          responseText = JSON.stringify({ intents: [intent("AskQuestion", [], [{ type: "Text", value: "I can't buy games for you. I can add it to your library as Plan to Play so you remember it." }])] });
        } else if (queryLower.includes("difference between")) {
          // A general question the model leaves for answer mode (no text of its own).
          responseText = JSON.stringify({ intents: [intent("AskQuestion")] });
        } else if (queryLower.includes("too hard")) {
          responseText = JSON.stringify({ intents: [intent("AskQuestion", [], [{ type: "Text", value: "It's tough at first, but you can explore elsewhere and come back stronger." }])] });
        } else if (queryLower.includes("backlog") || queryLower.includes("how many")) {
          responseText = JSON.stringify({ intents: [intent("LibraryQuestion", [], [{ type: "Text", value: query }])] });
        } else if (queryLower.includes("finished")) {
          responseText = JSON.stringify({
            intents: [
              intent("AddGame", [{ type: "Library", name: named }]),
              intent("SetStatus", [{ type: "Game", name: named }], [{ type: "Status", value: "completed" }]),
            ],
          });
        } else if (statusMatch && !queryLower.includes("remove")) {
          responseText = JSON.stringify({
            intents: [intent("SetStatus", [{ type: "Game", name: named }], [{ type: "Status", value: statusFor[statusMatch[1]!] }])],
          });
        } else if (queryLower.includes("remove")) {
          responseText = JSON.stringify({ intents: [intent("RemoveGame", [{ type: "Game", name: named }])] });
        }
      }

      if (responseText) {
        return responseText;
      }
      
      coreLog.warn(`[OllamaClient Mock] No match found for query "${query}", proceeding to live request...`);
    }

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
