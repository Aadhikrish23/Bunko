import { ClarificationOption } from "../entity/ClarificationOption";

export interface OptionEntity {
  _id?: string | { toString(): string };
  id?: string | number;
  title?: string;
  label?: string;
  name?: string;
  provider?: string;
  exePath?: string;
  providers?: Record<string, { installed?: boolean }>;
  description?: string;
  subtitle?: string;
}


export class ClarificationOptionBuilder {
  /**
   * Builds a UI-friendly ClarificationOption from raw entity structures without using 'any'.
   */
  build(entity: OptionEntity, entityType: string): ClarificationOption {
    const id = entity._id?.toString() || entity.id?.toString() || String(entity);
    const label = entity.title || entity.label || String(entity);
    let description = "";

    const typeLower = entityType.toLowerCase();
    if (typeLower === "game" || typeLower === "librarygame" || entity.title) {
      const providerName = (entity.provider || "manual").toUpperCase();
      const isInstalled = !!(entity.exePath || (entity.providers && Object.values(entity.providers).some((p) => p.installed)));
      const installText = isInstalled ? "Installed" : "Not Installed";
      description = `${providerName} • ${installText}`;
    } else {
      description = entity.description || entity.subtitle || "";
    }

    return {
      id,
      label,
      subtitle: description,
      description,
      metadata: {
        entityType,
        rawEntity: entity,
      },
    };
  }
}

export default new ClarificationOptionBuilder();
