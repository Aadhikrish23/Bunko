import { prisma } from '../../config/prisma';

// Stored reading positions in words, for anything that shows one to the reader (journal,
// notes): chapter titles from the edition's chapter graph, pages as "p. N".

export interface UnitLabel {
  editionId: string;
  structuralId: string;
  label: string;
  order: number;
}

// Only the chapter labels -- the stored graph also carries every chapter's full text.
export async function chapterLabels(editionIds: string[]): Promise<Map<string, UnitLabel[]>> {
  const byEdition = new Map<string, UnitLabel[]>();
  if (editionIds.length === 0) return byEdition;
  const rows = await prisma.$queryRaw<UnitLabel[]>`
    SELECT e.id AS "editionId", u->>'structuralId' AS "structuralId", u->>'label' AS "label", (u->>'order')::int AS "order"
    FROM "Edition" e, jsonb_array_elements(e."chapterGraph"->'units') u
    WHERE e.id = ANY(${editionIds}::text[]) AND jsonb_typeof(e."chapterGraph"->'units') = 'array'`;
  for (const row of rows) byEdition.set(row.editionId, [...(byEdition.get(row.editionId) ?? []), row]);
  return byEdition;
}

/**
 * A stored position in words. Physical positions are already what the reader typed; PDF
 * positions are page numbers; the flow reader stores a chapter's structuralId and the EPUB
 * view a CFI, whose first step after /6/ is the spine item (2 = first).
 */
export function positionLabel(position: string | null, format: string, units: UnitLabel[]): string | null {
  if (!position) return null;
  if (format === 'PHYSICAL') return position;
  if (/^\d+$/.test(position)) return `p. ${position}`;
  const cfi = /^epubcfi\(\/6\/(\d+)/.exec(position);
  const unit = cfi
    ? units.find((u) => u.order === Number(cfi[1]) / 2 - 1)
    : units.find((u) => u.structuralId === position);
  return unit?.label ?? null;
}

