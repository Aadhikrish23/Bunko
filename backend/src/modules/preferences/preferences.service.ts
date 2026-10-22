import type { Prisma, UserPreference } from '@prisma/client';
import { prisma } from '../../config/prisma';
import type { PreferenceKey } from './preferences.schema';

export interface PreferenceDto {
  key: string;
  value: Record<string, unknown>;
  updatedAt: Date;
}

function toDto(row: UserPreference): PreferenceDto {
  return { key: row.key, value: row.value as Record<string, unknown>, updatedAt: row.updatedAt };
}

export async function listPreferences(userId: string): Promise<PreferenceDto[]> {
  const rows = await prisma.userPreference.findMany({ where: { userId }, orderBy: { key: 'asc' } });
  return rows.map(toDto);
}

// SRS §21.2 "last-write-wins for simple preferences". A client clock
// running ahead would otherwise make its writes win forever, so the
// client's timestamp is capped at the server's now.
export async function setPreference(
  userId: string,
  key: PreferenceKey,
  value: Record<string, unknown>,
  clientUpdatedAt: Date,
  deviceId: string | null,
  now: Date = new Date(),
): Promise<{ preference: PreferenceDto; applied: boolean }> {
  const updatedAt = clientUpdatedAt > now ? now : clientUpdatedAt;
  const existing = await prisma.userPreference.findUnique({ where: { userId_key: { userId, key } } });
  if (existing && existing.updatedAt >= updatedAt) {
    return { preference: toDto(existing), applied: false };
  }

  const json = value as Prisma.InputJsonValue;
  const row = await prisma.userPreference.upsert({
    where: { userId_key: { userId, key } },
    create: { userId, key, value: json, updatedAt, updatedByDeviceId: deviceId },
    update: { value: json, updatedAt, updatedByDeviceId: deviceId },
  });
  return { preference: toDto(row), applied: true };
}
