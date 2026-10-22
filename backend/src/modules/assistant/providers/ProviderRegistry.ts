import { AIProvider } from "./AIProvider";
import { NvidiaNimProvider } from "./NvidiaNimProvider";
import { OllamaProvider } from "./OllamaProvider";

/**
 * Which model backs the assistant is configuration (AI_PROVIDER), not code. A new provider
 * is one class implementing AIProvider plus one registerProvider() call -- here for a
 * general one, or in the composition root for an app's own (e.g. a test mock).
 */
export type ProviderFactory = () => AIProvider;

const factories = new Map<string, ProviderFactory>([
  ["nvidia", () => new NvidiaNimProvider()],
  ["ollama", () => new OllamaProvider()],
]);

export function registerProvider(name: string, factory: ProviderFactory): void {
  factories.set(name.toLowerCase(), factory);
}

export function providerNames(): string[] {
  return [...factories.keys()];
}

/** The provider for `name`, or undefined when none is registered under it. */
export function createProvider(name: string): AIProvider | undefined {
  return factories.get(name.toLowerCase())?.();
}
