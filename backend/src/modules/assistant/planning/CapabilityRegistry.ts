import { Capability } from "./Capability";

export class CapabilityRegistry {
  private readonly capabilities = new Map<string, Capability>();

  register(capability: Capability): void {
    if (this.capabilities.has(capability.id)) {
      throw new Error(`Capability "${capability.id}" is already registered.`);
    }
    this.capabilities.set(capability.id, capability);
  }

  get(id: string): Capability | undefined {
    return this.capabilities.get(id);
  }

  list(): Capability[] {
    return Array.from(this.capabilities.values());
  }

  exists(id: string): boolean {
    return this.capabilities.has(id);
  }

  remove(id: string): void {
    this.capabilities.delete(id);
  }
}

export default new CapabilityRegistry();
