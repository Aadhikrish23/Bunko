import { IntentPlan } from "../intent/IntentPlan";
import { ResolvedCapability } from "./ResolvedCapability";
import { CapabilityRegistry } from "./CapabilityRegistry";
import capabilityRegistry from "./CapabilityRegistry";
import aiTraceLogger from "../debug/AITraceLogger";

export class CapabilityResolver {
  constructor(private readonly registry: CapabilityRegistry) {}

  /**
   * Matches intents from an IntentPlan against registered capabilities.
   */
  resolve(intentPlan: IntentPlan): ResolvedCapability[] {
    const trace = aiTraceLogger.current();
    const startTime = Date.now();

    try {
      const resolved: ResolvedCapability[] = [];

      for (const intent of intentPlan.intents) {
        const match = this.registry
          .list()
          .find((cap) => {
            if (cap.intentType === intent.type) return true;
            // The pack says which extra intents a capability serves (no domain names here).
            if (cap.extraIntentTypes?.includes(intent.type)) return true;
            return false;
          });

        if (match) {
          resolved.push({
            capability: match,
            intent,
            confidence: intent.confidence,
          });
        }
      }

      if (trace) {
        const elapsed = Date.now() - startTime;
        trace.log("CapabilityResolver", "ResolvedCapabilities", resolved, elapsed);

        // Update stats
        trace.updateStats({
          resolvedCapabilities: resolved.map((res) => res.capability.id),
        });
      }

      return resolved;
    } catch (error) {
      if (trace) {
        trace.error("CapabilityResolver", error);
      }
      throw error;
    }
  }
}

export default new CapabilityResolver(capabilityRegistry);
