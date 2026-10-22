import { AIPlan, AIPlanStep } from "../types/AIPlan";

export class AIPlanParser {
  /**
   * Cleans, parses, and validates raw string responses from LLMs into structured AIPlan objects.
   */
  parse(rawResponse: string): AIPlan {
    let cleanText = rawResponse.trim();

    // Strip markdown code fences if present
    if (cleanText.startsWith("```")) {
      cleanText = cleanText.replace(/^```[a-zA-Z0-9]*\s*/, "");
      cleanText = cleanText.replace(/\s*```$/, "");
      cleanText = cleanText.trim();
    }

    let parsed: any;
    try {
      parsed = JSON.parse(cleanText);
    } catch (err: any) {
      throw new Error(`Failed to parse plan JSON: ${err.message}`);
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Invalid plan structure: Root must be an object.");
    }

    if (typeof parsed.id !== "string") {
      throw new Error("Invalid plan structure: 'id' must be a string.");
    }

    if (!Array.isArray(parsed.steps)) {
      throw new Error("Invalid plan structure: 'steps' must be an array.");
    }

    const validatedSteps: AIPlanStep[] = [];

    for (let i = 0; i < parsed.steps.length; i++) {
      const step = parsed.steps[i];
      if (!step || typeof step !== "object" || Array.isArray(step)) {
        throw new Error(`Invalid plan step at index ${i}: Step must be an object.`);
      }

      if (typeof step.id !== "string") {
        throw new Error(`Invalid plan step at index ${i}: 'id' must be a string.`);
      }

      if (typeof step.tool !== "string") {
        throw new Error(`Invalid plan step at index ${i}: 'tool' must be a string.`);
      }

      if (!step.input || typeof step.input !== "object" || Array.isArray(step.input)) {
        throw new Error(`Invalid plan step at index ${i}: 'input' must be an object.`);
      }

      validatedSteps.push({
        id: step.id,
        tool: step.tool,
        input: step.input,
      });
    }

    return {
      id: parsed.id,
      steps: validatedSteps,
    };
  }
}

export default new AIPlanParser();
