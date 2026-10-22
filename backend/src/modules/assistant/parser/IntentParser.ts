import { LLMIntentResponse } from "../providers/contracts/LLMIntentResponse";
import { validateLLMIntentResponse } from "./IntentValidation";
import { AIRuntimeError } from "../runtime/errors/AIRuntimeError";

function cleanJsonString(input: string): string {
  let result = "";
  let inString = false;
  let stringChar = "";
  let isEscaped = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inString) {
      result += char;
      if (isEscaped) {
        isEscaped = false;
      } else if (char === "\\") {
        isEscaped = true;
      } else if (char === stringChar) {
        inString = false;
      }
    } else {
      // Check for single-line comment
      if (char === "/" && input[i + 1] === "/") {
        i += 2;
        while (i < input.length && input[i] !== "\n" && input[i] !== "\r") {
          i++;
        }
        result += "\n";
      }
      // Check for multi-line comment
      else if (char === "/" && input[i + 1] === "*") {
        i += 2;
        while (i < input.length && !(input[i] === "*" && input[i + 1] === "/")) {
          i++;
        }
        i++; // skip '/' of '*/'
      }
      // Check for string boundaries
      else if (char === '"' || char === "'") {
        result += char;
        inString = true;
        stringChar = char;
        isEscaped = false;
      }
      // Check for trailing comma
      else if (char === ",") {
        let nextIndex = i + 1;
        let isTrailing = false;
        while (nextIndex < input.length) {
          const nextChar = input[nextIndex]!;
          if (/\s/.test(nextChar)) {
            nextIndex++;
          } else if (nextChar === "/" && input[nextIndex + 1] === "/") {
            nextIndex += 2;
            while (nextIndex < input.length && input[nextIndex] !== "\n" && input[nextIndex] !== "\r") {
              nextIndex++;
            }
          } else if (nextChar === "/" && input[nextIndex + 1] === "*") {
            nextIndex += 2;
            while (nextIndex < input.length && !(input[nextIndex] === "*" && input[nextIndex + 1] === "/")) {
              nextIndex++;
            }
            nextIndex += 2;
          } else if (nextChar === "}" || nextChar === "]") {
            isTrailing = true;
            break;
          } else {
            break;
          }
        }

        if (isTrailing) {
          // Skip the trailing comma
        } else {
          result += char;
        }
      } else {
        result += char;
      }
    }
  }
  return result;
}

/**
 * The model sometimes closes with the wrong bracket ("}" where "]" belongs, then "]" for "}").
 * Each closer that doesn't match the innermost opener becomes the one that does.
 */
export function fixMismatchedClosers(input: string): string {
  const stack: string[] = [];
  let inString = false;
  let isEscaped = false;
  let out = "";
  for (const char of input) {
    if (inString) {
      out += char;
      if (isEscaped) isEscaped = false;
      else if (char === "\\") isEscaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
    } else if (char === "{" || char === "[") {
      stack.push(char);
      out += char;
    } else if (char === "}" || char === "]") {
      const open = stack.pop();
      out += open === "[" ? "]" : open === "{" ? "}" : char;
    } else {
      out += char;
    }
  }
  return out;
}

function balanceJson(input: string): string {
  const stack: Array<"{" | "["> = [];
  let inString = false;
  let isEscaped = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === "\\") {
        isEscaped = true;
      } else if (char === '"') {
        inString = false;
      }
    } else {
      if (char === '"') {
        inString = true;
      } else if (char === "{") {
        stack.push("{");
      } else if (char === "}") {
        if (stack[stack.length - 1] === "{") {
          stack.pop();
        }
      } else if (char === "[") {
        stack.push("[");
      } else if (char === "]") {
        if (stack[stack.length - 1] === "[") {
          stack.pop();
        }
      }
    }
  }

  let result = input.trim();
  while (result.endsWith(",")) {
    result = result.substring(0, result.length - 1).trim();
  }

  while (stack.length > 0) {
    const last = stack.pop();
    if (last === "{") {
      result += "}";
    } else if (last === "[") {
      result += "]";
    }
  }

  return result;
}

function extractBalancedJson(str: string, startIdx: number): string {
  let braceCount = 0;
  let inString = false;
  let isEscaped = false;

  for (let i = startIdx; i < str.length; i++) {
    const char = str[i];
    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === "\\") {
        isEscaped = true;
      } else if (char === '"') {
        inString = false;
      }
    } else {
      if (char === '"') {
        inString = true;
      } else if (char === "{") {
        braceCount++;
      } else if (char === "}") {
        braceCount--;
        if (braceCount === 0) {
          return str.substring(startIdx, i + 1);
        }
      }
    }
  }
  return str.substring(startIdx);
}

export class IntentParser {
  /**
   * Extracts, parses, and validates the raw JSON response from the LLM provider into an LLMIntentResponse.
   */
  parse(rawResponse: string): LLMIntentResponse {
    const clean = (text: string, forceDoubleQuotes: boolean = false) => {
      // 1. Remove markdown fences (case insensitive)
      let t = text.replace(/```json/gi, "").replace(/```/g, "");

      // 2. Extract JSON object using regex for last occurred intents block, or fallback to first '{'
      let firstBrace = -1;
      const intentsRegex = /\{\s*['"]intents['"]/gi;
      let match;
      while ((match = intentsRegex.exec(t)) !== null) {
        firstBrace = match.index;
      }
      if (firstBrace === -1) {
        firstBrace = t.indexOf("{");
      }

      if (firstBrace === -1) {
        throw new Error("Could not find a valid JSON object structure in the LLM response.");
      }

      t = extractBalancedJson(t, firstBrace);

      // 3. Clean JSON comments and trailing commas
      t = cleanJsonString(t);

      // Heal common malformed structures from smaller LLMs like phi3:mini
      t = t.replace(/['"]\[\{['"]\s*:\s*\[\s*['"]targets['"]\s*,\s*\[\s*([\s\S]*?)\s*\]\s*\]/gi, '"targets": [$1]');
      t = t.replace(/['"]\[\{['"]\s*:\s*\[\s*['"]parameters['"]\s*,\s*\[\s*([\s\S]*?)\s*\]\s*\]/gi, '"parameters": [$1]');

      // 4. Fallback quotes normalization if requested
      if (forceDoubleQuotes) {
        t = t.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"');
      }

      // 5. Fix wrong closing brackets, then balance unclosed ones
      t = fixMismatchedClosers(t);
      t = balanceJson(t);

      return t.trim();
    };

    let parsed: any;
    let lastError: Error | null = null;

    // Try 1: Standard normalization
    try {
      const cleaned = clean(rawResponse, false);
      parsed = JSON.parse(cleaned);
    } catch (err: any) {
      lastError = err;
      // Try 2: Stronger quote normalization
      try {
        const cleaned = clean(rawResponse, true);
        parsed = JSON.parse(cleaned);
      } catch (err2: any) {
        lastError = err2;
      }
    }

    if (!parsed) {
      // Throw structured validation error, do not expose raw JSON syntax exception to API
      throw new AIRuntimeError(
        `Failed to parse LLM JSON: ${lastError ? lastError.message : "Invalid JSON format"}`,
        "PROVIDER_VALIDATION_ERROR",
        false,
        { rawResponse }
      );
    }

    // Validate using validateLLMIntentResponse
    try {
      return validateLLMIntentResponse(parsed);
    } catch (valErr: any) {
      throw new AIRuntimeError(
        valErr.message,
        "PROVIDER_VALIDATION_ERROR",
        false,
        { rawResponse, parsed }
      );
    }
  }
}

export default new IntentParser();

