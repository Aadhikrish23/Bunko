// Destructive/irreversible tools must never guess their target from a stale
// conversation reference (e.g. "currentGame" left over from an unrelated earlier
// action) when the LLM failed to name one explicitly -- ask the user instead of
// risking deleting/disconnecting/removing the wrong thing.
import { domainPack } from "../domain/activeDomain";

export const usesReferenceFallback = (toolName: string) => !domainPack().tools.noReferenceFallbackTools.includes(toolName);
