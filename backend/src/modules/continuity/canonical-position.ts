import { prisma } from '../../config/prisma';

export interface CanonicalPositionData {
  structuralId: string | null;
  chapterLabel: string | null;
  textAnchor: string | null;
  pageNumber: number | null;
  confidence: number | null;
}

// A leaf module (only depends on prisma) so both reading-sessions
// (automatic update when a session ends, SRS §6.2 "Automatic Where
// Possible") and continuity (manual correction, T-037) can write the
// journey's canonical position without a circular module dependency.
//
// `deviceId` records which device moved the position (Phase 9) — the
// signal sync uses to tell a concurrent change on another device apart
// from this device's own earlier progress (T-070).
export async function upsertCanonicalPosition(
  journeyId: string,
  data: CanonicalPositionData,
  deviceId: string | null = null,
): Promise<void> {
  const journey = await prisma.readingJourney.findUnique({ where: { id: journeyId } });
  if (!journey) return;

  const values = { ...data, updatedByDeviceId: deviceId };
  if (journey.canonicalPositionId) {
    await prisma.readingPosition.update({ where: { id: journey.canonicalPositionId }, data: values });
    return;
  }

  const position = await prisma.readingPosition.create({ data: values });
  await prisma.readingJourney.update({ where: { id: journeyId }, data: { canonicalPositionId: position.id } });
}
