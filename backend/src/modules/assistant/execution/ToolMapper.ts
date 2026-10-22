import { domainPack } from "../domain/activeDomain";

export class ToolMapper {
  /**
   * Every tool this capability can ever resolve to (empty if unmapped).
   */
  possibleToolsFor(capabilityId: string): string[] {
    const { multiToolCapabilities, capabilityTools } = domainPack().tools;
    const multi = multiToolCapabilities[capabilityId];
    if (multi) return [...multi];
    const single = capabilityTools[capabilityId];
    return single ? [single] : [];
  }

  /**
   * Maps a Capability ID to the corresponding tool name.
   */
  mapCapabilityToTool(
    capabilityId: string,
    targetsOrInput?: any[] | Record<string, unknown>,
    queryOrIntentType?: string
  ): string {
    const tools = domainPack().tools;
    // Some capabilities pick their tool per request (rate vs delete a review...).
    const chosen = tools.chooseTool?.(capabilityId, targetsOrInput, queryOrIntentType);
    if (chosen) return chosen;

    const toolName = tools.capabilityTools[capabilityId];
    if (!toolName) {
      throw new Error(`No tool mapping found for capability: ${capabilityId}`);
    }
    return toolName;
  }
}

export default new ToolMapper();
