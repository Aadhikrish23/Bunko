import registry from "./ContextProviderRegistry";
import { domainPack } from "../domain/activeDomain";

export function registerContextProviders() {
  domainPack().registerContextProviders(registry);
  return registry;
}
