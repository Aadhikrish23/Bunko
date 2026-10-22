import { ToolCapability } from "./ToolCapability";
import { domainPack } from "../domain/activeDomain";

export class ToolMetadataRegistry {
  private readonly capabilities = new Map<string, ToolCapability>();

  private seeded = false;

  /** The domain pack's tools, registered on first use (the pack is chosen at startup). */
  private seed(): void {
    if (this.seeded) return;
    this.seeded = true;
    for (const capability of domainPack().tools.metadata) this.register(capability);
  }

  /**
   * Registers a tool capability metadata. Only registers once.
   */
  register(capability: ToolCapability): void {
    if (this.capabilities.has(capability.id)) {
      return;
    }
    this.capabilities.set(capability.id, capability);
  }

  /**
   * Resolves capability metadata by ID or name.
   */
  get(id: string): ToolCapability | null {
    this.seed();
    return this.capabilities.get(id) || null;
  }

  /**
   * Lists all registered capabilities.
   */
  list(): ToolCapability[] {
    this.seed();
    return Array.from(this.capabilities.values());
  }
}

export default new ToolMetadataRegistry();
