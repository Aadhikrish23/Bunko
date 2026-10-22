import { LLMIntentResponse, LLMIntent, LLMIntentTarget, LLMIntentParameter } from "../providers/contracts/LLMIntentResponse";
import { IntentType } from "../intent/IntentType";
import { domainPack } from "../domain/activeDomain";
import { IntentTargetType } from "../intent/IntentTargetType";
import { IntentParameterType } from "../intent/IntentParameterType";

function recoverEnum(typeStr: string, allowedValues: string[]): string {
  if (typeof typeStr !== "string") return typeStr;
  let cleanType = typeStr.trim();
  const parts = cleanType.split(/[|,]/).map(p => p.trim());
  for (const part of parts) {
    const found = allowedValues.find(v => v.toLowerCase() === part.toLowerCase());
    if (found) return found;
  }
  return cleanType;
}

export function validateLLMIntentResponse(parsed: unknown): LLMIntentResponse {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid LLMIntentResponse structure: Root must be an object.");
  }

  const data = parsed as any;

  if (!Array.isArray(data.intents)) {
    throw new Error("Invalid LLMIntentResponse: 'intents' must be an array.");
  }

  const validatedIntents: LLMIntent[] = [];

  const allowedIntents: string[] = [...domainPack().intentTypes];
  const allowedTargets = Object.values(IntentTargetType);
  const allowedParameters = Object.values(IntentParameterType);

  for (let i = 0; i < data.intents.length; i++) {
    const intent = data.intents[i];
    if (!intent || typeof intent !== "object" || Array.isArray(intent)) {
      continue;
    }

    if (!intent.type) {
      continue;
    }

    // Self-healing & Normalizing intent.type
    let recoveredIntentType = recoverEnum(intent.type, allowedIntents);

    if (!allowedIntents.includes(recoveredIntentType as IntentType)) {
      throw new Error(`Invalid intent type at index ${i}: '${intent.type}' is not a valid IntentType.`);
    }

    if (intent.targets && !Array.isArray(intent.targets)) {
      intent.targets = [];
    }

    if (intent.parameters && !Array.isArray(intent.parameters)) {
      intent.parameters = [];
    }

    // Preprocessing pass: Self-heal targets that LLM wrongly placed in parameters list
    const rawTargets: any[] = [...(intent.targets || [])];
    const rawParameters: any[] = [];
    const parameters = intent.parameters || [];
    for (const param of parameters) {
      if (param && typeof param === "object" && !Array.isArray(param)) {
        const recoveredType = recoverEnum(param.type, allowedTargets);
        if (allowedTargets.includes(recoveredType as IntentTargetType)) {
          rawTargets.push({
            type: recoveredType,
            name: String(param.name || param.value || ""),
          });
        } else {
          rawParameters.push(param);
        }
      } else {
        rawParameters.push(param);
      }
    }

    // Process targets
    const validatedTargets: LLMIntentTarget[] = [];
    for (let j = 0; j < rawTargets.length; j++) {
      const target = rawTargets[j];
      if (!target || typeof target !== "object" || Array.isArray(target)) {
        throw new Error(`Invalid target at intent ${i}, target ${j}: Target must be an object.`);
      }

      // Self-healing & Normalizing target.type
      let recoveredTargetType = recoverEnum(target.type, allowedTargets);

      if (!allowedTargets.includes(recoveredTargetType as IntentTargetType)) {
        continue;
      }

      if (typeof target.name !== "string") {
        continue;
      }

      // Semantic normalization: trim and normalize repeated spaces
      let cleanName = target.name.trim().replace(/\s+/g, " ");

      // Target semantic validation: provider values
      if (recoveredTargetType === IntentTargetType.Provider) {
        const allowedProviders = ["epic", "steam", "gog", "ea", "ubisoft", "xbox"];
        if (!allowedProviders.includes(cleanName.toLowerCase())) {
          continue;
        }
        cleanName = cleanName.toLowerCase();
      }

      validatedTargets.push({
        type: recoveredTargetType as IntentTargetType,
        name: cleanName,
      });
    }

    // Process parameters & remove duplicates
    const validatedParameters: LLMIntentParameter[] = [];
    const seenParamTypes = new Set<string>();

    for (let k = 0; k < rawParameters.length; k++) {
      const param = rawParameters[k];
      if (!param || typeof param !== "object" || Array.isArray(param)) {
        continue;
      }

      if (!param.type && param.value === undefined) {
        continue;
      }

      // Self-healing & Normalizing param.type
      let recoveredParamType = recoverEnum(param.type, allowedParameters);

      if (!allowedParameters.includes(recoveredParamType as IntentParameterType)) {
        continue;
      }

      // Duplicate parameter prevention (keep the first one)
      if (seenParamTypes.has(recoveredParamType)) {
        continue;
      }
      seenParamTypes.add(recoveredParamType);

      let val = param.value;

      // Normalization of whitespace and spaces for string parameters
      if (typeof val === "string") {
        val = val.trim().replace(/\s+/g, " ");
      }

      // Semantic validation and normalization: Rating is numeric
      if (recoveredParamType === IntentParameterType.Rating) {
        // Convert to number if it is a numeric string
        if (typeof val === "string") {
          const num = Number(val);
          if (!isNaN(num)) {
            val = num;
          }
        }
        if (typeof val !== "number" || isNaN(val)) {
          continue;
        }
        if (val < 1 || val > 10) {
          continue;
        }
      }

      // Semantic validation and normalization: Status values
      if (recoveredParamType === IntentParameterType.Status) {
        const allowedStatuses = ["none", "plan", "playing", "paused", "completed", "dropped"];
        if (typeof val !== "string" || !allowedStatuses.includes(val.toLowerCase())) {
          continue;
        }
        val = val.toLowerCase();
      }

      // Semantic validation and normalization: Provider values
      if (recoveredParamType === IntentParameterType.Provider) {
        const allowedProviders = ["epic", "steam", "gog", "ea", "ubisoft", "xbox"];
        if (typeof val !== "string" || !allowedProviders.includes(val.toLowerCase())) {
          continue;
        }
        val = val.toLowerCase();
      }

      const valType = typeof val;
      if (valType !== "string" && valType !== "number" && valType !== "boolean") {
        continue;
      }

      validatedParameters.push({
        type: recoveredParamType as IntentParameterType,
        value: val,
      });
    }

    validatedIntents.push({
      type: recoveredIntentType as IntentType,
      targets: validatedTargets,
      parameters: validatedParameters,
    });
  }

  return {
    intents: validatedIntents,
  };
}

