import { AIProvider } from "./AIProvider";
import { AIRequestContext } from "../conversation/AIRequestContext";
import { Capability } from "../planning/Capability";
import { IntentPlan } from "../intent/IntentPlan";
import { domainPack } from "../domain/activeDomain";
import ollamaClient from "../clients/OllamaClient";
import intentParser from "../parser/IntentParser";
import intentNormalizer from "../intent/IntentNormalizer";
import aiTraceLogger from "../debug/AITraceLogger";
import AIConfig from "../config/AIConfig";

export class OllamaProvider implements AIProvider {
  async plan(
    request: string,
    context: AIRequestContext,
    capabilities: Capability[],
  ): Promise<IntentPlan> {
    const trace = aiTraceLogger.current();
    const startTime = Date.now();
    const toolContext = context.toolContext;


    try {
      const prompt = domainPack().prompts.plan(request, toolContext, capabilities, context);
      if (trace) {
        trace.log("Provider", "Prompt Generated", {
          model: AIConfig.ollamaModel,
          promptLength: prompt.length,
          capabilityCount: capabilities.length,
          requestLength: request.length,
          fullPrompt: prompt,
        });
      }
      
      const rawResponse = await ollamaClient.generate(prompt);
      if (trace) {
        trace.log("Provider", "Raw LLM Response Received", {
          characterCount: rawResponse.length,
          fullResponse: rawResponse,
        });
      }

      const llmIntentResponse = intentParser.parse(rawResponse);
      if (trace) {
        trace.log("Provider", "LLMIntentResponse", llmIntentResponse);
      }

      const parsedPlan = intentNormalizer.normalize(llmIntentResponse, toolContext.requestId || "");

      if (trace) {
        const elapsed = Date.now() - startTime;
        trace.log("Provider", "Normalized IntentPlan", parsedPlan, elapsed);
        
        // Update trace statistics summary
        trace.updateStats({
          intentCount: parsedPlan.intents?.length || 0,
        });
      }

      return parsedPlan;
    } catch (error) {
      if (trace) {
        trace.error("Provider", error);
      }
      throw error;
    }
  }

  async answer(question: string, context: AIRequestContext): Promise<string> {
    const prompt = domainPack().prompts.answer(question, context);
    const raw = await ollamaClient.generate(prompt);
    return raw.replace(/^\s*(answer:)?\s*/i, "").trim();
  }
}
