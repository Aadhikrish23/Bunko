import type { DomainPack } from "./DomainPack";

/**
 * The pack this process runs with. Set once by the composition root (aiController) before the
 * first message; core code asks for it instead of importing any domain directly.
 */
let active: DomainPack | undefined;

export function setDomainPack(pack: DomainPack): void {
  active = pack;
}

export function domainPack(): DomainPack {
  if (!active) throw new Error("No domain pack set: call setDomainPack() in the AI composition root first.");
  return active;
}
