import type { Soundtrack, SoundtrackMapping, SoundtrackTargetType } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/app-error';
import {
  PROVIDER_CAPABILITIES,
  UnsupportedSoundtrackUrlError,
  parseSoundtrackUrl,
  type ParsedSoundtrackUrl,
  type ProviderCapabilities,
} from './providers';
import type { CreateSoundtrackInput, UpdateSoundtrackInput, UpsertMappingInput } from './soundtrack.schema';

export interface MappingDto {
  id: string;
  soundtrackId: string;
  targetType: SoundtrackTargetType;
  targetKey: string;
  // Book title / shelf name for WORK/SHELF targets; null for free-text
  // targets, whose key is already the label.
  label: string | null;
}

export interface SoundtrackDto {
  id: string;
  name: string;
  url: string;
  provider: Soundtrack['provider'];
  embedUrl: string;
  capabilities: ProviderCapabilities;
  mappings: MappingDto[];
  createdAt: Date;
  updatedAt: Date;
}

export interface SoundtrackResolution {
  match: {
    soundtrack: SoundtrackDto;
    via: { mappingId: string; targetType: 'WORK' | 'SHELF' | 'GENRE'; targetKey: string; label: string | null };
  } | null;
}

// "Fantasy", " fantasy " and "FANTASY" are one genre/mood/situation.
export function normaliseLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function parseOrReject(url: string): ParsedSoundtrackUrl {
  try {
    return parseSoundtrackUrl(url);
  } catch (err) {
    if (err instanceof UnsupportedSoundtrackUrlError) {
      throw new AppError('VALIDATION_ERROR', err.message, undefined, [{ field: 'url', issue: err.message }]);
    }
    throw err;
  }
}

async function labelsFor(userId: string, mappings: SoundtrackMapping[]): Promise<Map<string, string>> {
  const workIds = mappings.filter((m) => m.targetType === 'WORK').map((m) => m.targetKey);
  const shelfIds = mappings.filter((m) => m.targetType === 'SHELF').map((m) => m.targetKey);
  const [works, shelves] = await Promise.all([
    workIds.length ? prisma.work.findMany({ where: { id: { in: workIds } }, select: { id: true, title: true } }) : [],
    shelfIds.length
      ? prisma.shelf.findMany({ where: { id: { in: shelfIds }, userId }, select: { id: true, name: true } })
      : [],
  ]);
  return new Map([...works.map((w) => [w.id, w.title] as const), ...shelves.map((s) => [s.id, s.name] as const)]);
}

function toMappingDto(mapping: SoundtrackMapping, labels: Map<string, string>): MappingDto {
  return {
    id: mapping.id,
    soundtrackId: mapping.soundtrackId,
    targetType: mapping.targetType,
    targetKey: mapping.targetKey,
    label: mapping.targetType === 'WORK' || mapping.targetType === 'SHELF' ? (labels.get(mapping.targetKey) ?? null) : null,
  };
}

function toSoundtrackDto(
  soundtrack: Soundtrack & { mappings: SoundtrackMapping[] },
  labels: Map<string, string>,
): SoundtrackDto {
  return {
    id: soundtrack.id,
    name: soundtrack.name,
    url: soundtrack.url,
    provider: soundtrack.provider,
    embedUrl: parseSoundtrackUrl(soundtrack.url).embedUrl,
    capabilities: PROVIDER_CAPABILITIES[soundtrack.provider],
    mappings: soundtrack.mappings.map((mapping) => toMappingDto(mapping, labels)),
    createdAt: soundtrack.createdAt,
    updatedAt: soundtrack.updatedAt,
  };
}

async function requireOwnSoundtrack(userId: string, id: string) {
  const soundtrack = await prisma.soundtrack.findFirst({ where: { id, userId }, include: { mappings: true } });
  if (!soundtrack) throw new AppError('NOT_FOUND', 'Soundtrack not found');
  return soundtrack;
}

async function withLabels(userId: string, soundtrack: Soundtrack & { mappings: SoundtrackMapping[] }) {
  return toSoundtrackDto(soundtrack, await labelsFor(userId, soundtrack.mappings));
}

export async function listSoundtracks(userId: string): Promise<SoundtrackDto[]> {
  const soundtracks = await prisma.soundtrack.findMany({
    where: { userId },
    include: { mappings: { orderBy: { createdAt: 'asc' } } },
    orderBy: { name: 'asc' },
  });
  const labels = await labelsFor(
    userId,
    soundtracks.flatMap((soundtrack) => soundtrack.mappings),
  );
  return soundtracks.map((soundtrack) => toSoundtrackDto(soundtrack, labels));
}

export async function createSoundtrack(userId: string, input: CreateSoundtrackInput): Promise<SoundtrackDto> {
  const parsed = parseOrReject(input.url);
  const soundtrack = await prisma.soundtrack.create({
    data: { userId, name: input.name, url: parsed.canonicalUrl, provider: parsed.provider },
    include: { mappings: true },
  });
  return withLabels(userId, soundtrack);
}

export async function updateSoundtrack(userId: string, id: string, input: UpdateSoundtrackInput): Promise<SoundtrackDto> {
  await requireOwnSoundtrack(userId, id);
  const parsed = input.url !== undefined ? parseOrReject(input.url) : null;
  const soundtrack = await prisma.soundtrack.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(parsed ? { url: parsed.canonicalUrl, provider: parsed.provider } : {}),
    },
    include: { mappings: { orderBy: { createdAt: 'asc' } } },
  });
  return withLabels(userId, soundtrack);
}

export async function deleteSoundtrack(userId: string, id: string): Promise<void> {
  await requireOwnSoundtrack(userId, id);
  await prisma.soundtrack.delete({ where: { id } }); // mappings cascade
}

async function requireTargetOwnership(userId: string, targetType: SoundtrackTargetType, key: string): Promise<void> {
  if (targetType === 'WORK') {
    const membership = await prisma.userWork.findUnique({ where: { userId_workId: { userId, workId: key } } });
    if (!membership) throw new AppError('NOT_FOUND', 'Work not found in your library');
  } else if (targetType === 'SHELF') {
    const shelf = await prisma.shelf.findFirst({ where: { id: key, userId } });
    if (!shelf) throw new AppError('NOT_FOUND', 'Shelf not found');
  }
}

// One playlist per target: mapping a target that already has a playlist
// re-points it rather than erroring.
export async function upsertMapping(userId: string, input: UpsertMappingInput): Promise<MappingDto> {
  await requireOwnSoundtrack(userId, input.soundtrackId);
  const targetKey =
    input.targetType === 'WORK' || input.targetType === 'SHELF' ? input.targetKey : normaliseLabel(input.targetKey);
  await requireTargetOwnership(userId, input.targetType, targetKey);

  const mapping = await prisma.soundtrackMapping.upsert({
    where: { userId_targetType_targetKey: { userId, targetType: input.targetType, targetKey } },
    create: { userId, soundtrackId: input.soundtrackId, targetType: input.targetType, targetKey },
    update: { soundtrackId: input.soundtrackId },
  });
  return toMappingDto(mapping, await labelsFor(userId, [mapping]));
}

export async function deleteMapping(userId: string, id: string): Promise<void> {
  const mapping = await prisma.soundtrackMapping.findFirst({ where: { id, userId } });
  if (!mapping) throw new AppError('NOT_FOUND', 'Soundtrack association not found');
  await prisma.soundtrackMapping.delete({ where: { id } });
}

// T-061: what automatic mode plays for a book — its own soundtrack,
// else one from a shelf it's on (shelves by name, for a stable choice),
// else one from its genres (in the book's genre order). Moods and
// situations aren't properties of a book, so they're manual picks only.
export async function resolveForWork(userId: string, workId: string): Promise<SoundtrackResolution> {
  const membership = await prisma.userWork.findUnique({
    where: { userId_workId: { userId, workId } },
    include: {
      work: { select: { genres: true } },
      shelves: { include: { shelf: { select: { id: true, name: true } } } },
    },
  });
  if (!membership) throw new AppError('NOT_FOUND', 'Work not found in your library');

  const shelves = membership.shelves.map((entry) => entry.shelf).sort((a, b) => a.name.localeCompare(b.name));
  const genres = [...new Set(membership.work.genres.map(normaliseLabel))];

  const mappings = await prisma.soundtrackMapping.findMany({
    where: {
      userId,
      OR: [
        { targetType: 'WORK', targetKey: workId },
        { targetType: 'SHELF', targetKey: { in: shelves.map((shelf) => shelf.id) } },
        { targetType: 'GENRE', targetKey: { in: genres } },
      ],
    },
  });

  const byKey = (type: SoundtrackTargetType, key: string) =>
    mappings.find((mapping) => mapping.targetType === type && mapping.targetKey === key);
  const chosen =
    byKey('WORK', workId) ??
    shelves.map((shelf) => byKey('SHELF', shelf.id)).find(Boolean) ??
    genres.map((genre) => byKey('GENRE', genre)).find(Boolean);
  if (!chosen) return { match: null };

  const soundtrack = await requireOwnSoundtrack(userId, chosen.soundtrackId);
  const labels = await labelsFor(userId, [...soundtrack.mappings, chosen]);
  return {
    match: {
      soundtrack: toSoundtrackDto(soundtrack, labels),
      via: {
        mappingId: chosen.id,
        targetType: chosen.targetType as 'WORK' | 'SHELF' | 'GENRE',
        targetKey: chosen.targetKey,
        label: toMappingDto(chosen, labels).label,
      },
    },
  };
}
