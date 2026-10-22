import { ContextCategory } from "./ContextCategory";
import { ContextProvider } from "./ContextProvider";

export class ContextProviderRegistry {
  private readonly providers = new Map<ContextCategory, ContextProvider>();

  register(provider: ContextProvider): void {
    if (this.providers.has(provider.category)) {
      throw new Error(
        `Context provider "${provider.category}" is already registered.`,
      );
    }

    this.providers.set(provider.category, provider);
  }

  get(category: ContextCategory): ContextProvider | undefined {
    return this.providers.get(category);
  }

  list(): ContextProvider[] {
    return [...this.providers.values()];
  }
}

export default new ContextProviderRegistry();