import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/app-error';
import { logger } from '../../lib/logger';
import { discoverRelatedBooks, fetchWorkDescription, searchBookMetadata } from '../metadata/metadata.service';
import type { CreateWorkInput, ListWorksQuery, UpdateWorkInput } from './library.schema';

export interface SeriesSiblingDto {
  workId: string;
  title: string;
  coverImageUrl: string | null;
  // Whether the *caller* already has this sibling in their own library —
  // lets the frontend offer "add" for the ones they don't (the actual
  // ask behind "show me the remaining books from that collection").
  inLibrary: boolean;
}

export interface WorkSummaryDto {
  id: string;
  title: string;
  authors: string[];
  status: string;
  // copyId is the caller's own copy of this edition, if one exists yet
  // (null right after an edition is created but before a copy is
  // attached) — exposed so the frontend can start a session or open the
  // reader without a separate lookup (openapi.yaml's EditionResponse
  // didn't originally expose this).
  editions: { id: string; format: string; publisher: string | null; copyId: string | null }[];
  // Null until the first reading session for this work exists (the
  // journey is created lazily). Exposed so the frontend can call
  // continuity's resolve-position (T-035/T-036) without a separate
  // lookup — openapi.yaml's WorkResponse didn't originally expose this.
  journeyId: string | null;
  // Already stored on Work (DATA_MODEL.md §2) but never exposed via
  // openapi.yaml — the shelf UI (T-016 frontend) groups books by these.
  genres: string[];
  seriesName: string | null;
  shelfIds: string[];
  // Also already stored (set from the Open Library candidate at creation
  // time, ARCHITECTURE.md §11) but never returned — covers appeared only
  // in the "add a book" search results and vanished everywhere after.
  coverImageUrl: string | null;
  // Synopsis — stored on Work (DATA_MODEL.md §2), fetched best-effort
  // from Open Library at add time (see fetchWorkDescription).
  description: string | null;
  originalLanguage: string | null;
  language: string | null;
  partsCount: number | null;
  chaptersCount: number | null;
  // Only populated on a single-work GET, not on list views (avoids an
  // N+1 for every row in a library listing) — see getWork/getUserWorkOrThrow.
  seriesWorks: SeriesSiblingDto[];
}

function userWorkInclude(userId: string) {
  return {
    work: {
      include: {
        authors: { include: { author: true } },
        editions: { include: { copies: { where: { userId } } } },
        series: true,
      },
    },
    shelves: { include: { shelf: true } },
  } satisfies Prisma.UserWorkInclude;
}

type UserWorkWithRelations = Prisma.UserWorkGetPayload<{ include: ReturnType<typeof userWorkInclude> }>;

function toWorkDto(
  userWork: UserWorkWithRelations,
  journeyId: string | null,
  seriesWorks: SeriesSiblingDto[] = [],
): WorkSummaryDto {
  return {
    id: userWork.work.id,
    title: userWork.work.title,
    authors: userWork.work.authors.map((wa) => wa.author.name),
    status: userWork.status,
    editions: userWork.work.editions.map((edition) => ({
      id: edition.id,
      format: edition.format,
      publisher: edition.publisher,
      copyId: edition.copies[0]?.id ?? null,
    })),
    journeyId,
    genres: userWork.work.genres,
    seriesName: userWork.work.series?.name ?? null,
    shelfIds: userWork.shelves.map((sw) => sw.shelf.id),
    coverImageUrl: userWork.work.coverImageUrl,
    description: userWork.work.description,
    originalLanguage: userWork.work.originalLanguage,
    language: userWork.work.language,
    partsCount: userWork.work.partsCount,
    chaptersCount: userWork.work.chaptersCount,
    seriesWorks,
  };
}

// "Other books from that collection" (the actual ask behind wanting
// series parts to show each other) — every other Work sharing this
// seriesId, regardless of whose library they're in, with inLibrary
// telling the frontend whether to link to it or offer to add it.
async function getSeriesSiblings(seriesId: string, currentWorkId: string, userId: string): Promise<SeriesSiblingDto[]> {
  const siblings = await prisma.work.findMany({
    where: { seriesId, id: { not: currentWorkId } },
    select: { id: true, title: true, coverImageUrl: true },
    orderBy: { title: 'asc' },
  });
  if (siblings.length === 0) return [];

  const memberships = await prisma.userWork.findMany({
    where: { userId, workId: { in: siblings.map((s) => s.id) } },
    select: { workId: true },
  });
  const inLibraryIds = new Set(memberships.map((m) => m.workId));

  return siblings.map((sibling) => ({
    workId: sibling.id,
    title: sibling.title,
    coverImageUrl: sibling.coverImageUrl,
    inLibrary: inLibraryIds.has(sibling.id),
  }));
}

// No unique constraint on Author.name / Series.name in DATA_MODEL.md, so
// this is a find-first-else-create rather than an atomic upsert — a
// benign MVP simplification; a rare concurrent add of a brand-new name
// could in theory create a duplicate row, acceptable at MVP scale.
async function findOrCreateAuthor(name: string) {
  const existing = await prisma.author.findFirst({ where: { name } });
  return existing ?? prisma.author.create({ data: { name } });
}

async function findOrCreateSeries(name: string) {
  const existing = await prisma.series.findFirst({ where: { name } });
  return existing ?? prisma.series.create({ data: { name } });
}

async function syncRelatedSeriesWorks(
  work: { id: string; title: string; seriesId: string | null; genres: string[] },
  authorNames: string[],
): Promise<string | null> {
  try {
    const discovery = await discoverRelatedBooks(work.title, authorNames[0]);
    if (!discovery || discovery.books.length === 0) return work.seriesId;

    let seriesId = work.seriesId;
    if (!seriesId) {
      const series = await findOrCreateSeries(discovery.seriesName);
      seriesId = series.id;
      await prisma.work.update({
        where: { id: work.id },
        data: { seriesId: series.id },
      });
    }

    for (const sibling of discovery.books) {
      const existing = await prisma.work.findFirst({
        where: {
          OR: [
            { seriesId, title: { equals: sibling.title, mode: 'insensitive' } },
            ...(sibling.externalId
              ? [{ externalSource: sibling.externalSource, externalId: sibling.externalId }]
              : []),
          ],
        },
      });

      if (!existing) {
        const createdSibling = await prisma.work.create({
          data: {
            title: sibling.title,
            seriesId,
            genres: work.genres,
            description: sibling.description,
            coverImageUrl: sibling.coverImageUrl,
            externalSource: sibling.externalSource,
            externalId: sibling.externalId,
          },
        });

        if (sibling.authors.length > 0) {
          const authors = await Promise.all(sibling.authors.map(findOrCreateAuthor));
          await prisma.workAuthor.createMany({
            data: authors.map((a) => ({ workId: createdSibling.id, authorId: a.id })),
            skipDuplicates: true,
          });
        }
      }
    }

    return seriesId;
  } catch (err) {
    logger.warn({ err, workId: work.id }, 'Failed to sync related series works');
    return work.seriesId;
  }
}

// Always includes series siblings — every caller of this helper is
// working with exactly one Work, so the extra query is cheap; list
// endpoints (listWorks) build their own DTOs directly with toWorkDto
// instead of going through this, precisely to skip it at N-row scale.
async function getUserWorkOrThrow(userId: string, workId: string): Promise<WorkSummaryDto> {
  const [userWork, journey] = await Promise.all([
    prisma.userWork.findUnique({
      where: { userId_workId: { userId, workId } },
      include: userWorkInclude(userId),
    }),
    prisma.readingJourney.findUnique({ where: { userId_workId: { userId, workId } }, select: { id: true } }),
  ]);
  if (!userWork) {
    throw new AppError('NOT_FOUND', 'Work not found in your library');
  }

  let seriesWorks = userWork.work.seriesId
    ? await getSeriesSiblings(userWork.work.seriesId, userWork.work.id, userId)
    : [];

  // If no series siblings exist yet, lazily attempt discovery so previously
  // added books also receive their related siblings on their detail page
  if (seriesWorks.length === 0) {
    const authorNames = userWork.work.authors.map((wa) => wa.author.name);
    const resolvedSeriesId = await syncRelatedSeriesWorks(
      {
        id: userWork.work.id,
        title: userWork.work.title,
        seriesId: userWork.work.seriesId,
        genres: userWork.work.genres,
      },
      authorNames,
    );
    if (resolvedSeriesId) {
      seriesWorks = await getSeriesSiblings(resolvedSeriesId, userWork.work.id, userId);
    }
  }

  if (!userWork.work.coverImageUrl) {
    try {
      const candidates = await searchBookMetadata(userWork.work.title);
      const matched = candidates.find((c) => c.coverImageUrl);
      if (matched?.coverImageUrl) {
        await prisma.work.update({
          where: { id: userWork.work.id },
          data: { coverImageUrl: matched.coverImageUrl },
        });
        userWork.work.coverImageUrl = matched.coverImageUrl;
      }
    } catch {
      // Ignore background cover enrichment failure
    }
  }

  return toWorkDto(userWork, journey?.id ?? null, seriesWorks);
}

export async function createWork(
  userId: string,
  input: CreateWorkInput,
): Promise<{ dto: WorkSummaryDto; alreadyInLibrary: boolean }> {
  if ('workId' in input) {
    const existingWork = await prisma.work.findUnique({ where: { id: input.workId } });
    if (!existingWork) {
      throw new AppError('NOT_FOUND', 'Work not found');
    }
    const existingMembership = await prisma.userWork.findUnique({
      where: { userId_workId: { userId, workId: existingWork.id } },
    });
    if (!existingMembership) {
      await prisma.userWork.create({ data: { userId, workId: existingWork.id } });
    }
    return { dto: await getUserWorkOrThrow(userId, existingWork.id), alreadyInLibrary: Boolean(existingMembership) };
  }

  let work = input.externalSource && input.externalId
    ? await prisma.work.findUnique({
        where: {
          externalSource_externalId: { externalSource: input.externalSource, externalId: input.externalId },
        },
      })
    : null;

  if (work) {
    // If the work already exists in DB, update any missing metadata fields
    // (coverImageUrl, description, originalLanguage, language, partsCount, chaptersCount)
    // with fresh incoming values or fallback search.
    const updateData: Prisma.WorkUpdateInput = {};

    let newCover = input.coverImageUrl ?? null;
    if (!newCover && !work.coverImageUrl) {
      try {
        const candidates = await searchBookMetadata(input.title);
        const matched = candidates.find((c) => c.coverImageUrl);
        if (matched?.coverImageUrl) {
          newCover = matched.coverImageUrl;
        }
      } catch {
        // Ignore fallback error
      }
    }

    if (!work.coverImageUrl && newCover) {
      updateData.coverImageUrl = newCover;
      work.coverImageUrl = newCover;
    }
    if (!work.description && input.description) {
      updateData.description = input.description;
      work.description = input.description;
    }
    if (!work.originalLanguage && input.originalLanguage) {
      updateData.originalLanguage = input.originalLanguage;
      work.originalLanguage = input.originalLanguage;
    }
    if (!work.language && input.language) {
      updateData.language = input.language;
      work.language = input.language;
    }
    if (work.partsCount === null && input.partsCount !== undefined && input.partsCount !== null) {
      updateData.partsCount = input.partsCount;
      work.partsCount = input.partsCount;
    }
    if (work.chaptersCount === null && input.chaptersCount !== undefined && input.chaptersCount !== null) {
      updateData.chaptersCount = input.chaptersCount;
      work.chaptersCount = input.chaptersCount;
    }

    if (Object.keys(updateData).length > 0) {
      work = await prisma.work.update({
        where: { id: work.id },
        data: updateData,
      });
    }
  } else {
    const series = input.seriesName ? await findOrCreateSeries(input.seriesName) : null;
    // Best-effort synopsis — if already provided by search candidate (e.g. Google Books,
    // Inventaire, or first sentence), use it directly. Otherwise, attempt a single fetch
    // from the external source once per add.
    const description =
      input.description ??
      (input.externalSource && input.externalId
        ? await fetchWorkDescription(input.externalSource, input.externalId)
        : null);

    let coverImageUrl = input.coverImageUrl ?? null;
    if (!coverImageUrl) {
      try {
        const candidates = await searchBookMetadata(input.title);
        const matched = candidates.find((c) => c.coverImageUrl);
        if (matched?.coverImageUrl) {
          coverImageUrl = matched.coverImageUrl;
        }
      } catch {
        // Ignore fallback error
      }
    }

    work = await prisma.work.create({
      data: {
        title: input.title,
        seriesId: series?.id ?? null,
        genres: input.genres,
        description,
        coverImageUrl,
        originalLanguage: input.originalLanguage ?? null,
        language: input.language ?? null,
        partsCount: input.partsCount ?? null,
        chaptersCount: input.chaptersCount ?? null,
        externalSource: input.externalSource ?? null,
        externalId: input.externalId ?? null,
      },
    });

    if (input.authors.length > 0) {
      const authors = await Promise.all(input.authors.map(findOrCreateAuthor));
      await prisma.workAuthor.createMany({
        data: authors.map((author) => ({ workId: work!.id, authorId: author.id })),
        skipDuplicates: true,
      });
    }

    // Automatically discover and link related works in the same series or universe
    await syncRelatedSeriesWorks(
      {
        id: work.id,
        title: work.title,
        seriesId: work.seriesId,
        genres: work.genres,
      },
      input.authors,
    );
  }

  const existingMembership = await prisma.userWork.findUnique({
    where: { userId_workId: { userId, workId: work.id } },
  });
  if (!existingMembership) {
    await prisma.userWork.create({ data: { userId, workId: work.id } });
  }

  return { dto: await getUserWorkOrThrow(userId, work.id), alreadyInLibrary: Boolean(existingMembership) };
}

export async function listWorks(
  userId: string,
  query: ListWorksQuery,
): Promise<{ items: WorkSummaryDto[]; total: number }> {
  const where: Prisma.UserWorkWhereInput = {
    userId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.shelfId ? { shelves: { some: { shelfId: query.shelfId } } } : {}),
    ...(query.q
      ? {
          work: {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { authors: { some: { author: { name: { contains: query.q, mode: 'insensitive' } } } } },
            ],
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.userWork.findMany({
      where,
      include: userWorkInclude(userId),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      orderBy: { addedAt: 'desc' },
    }),
    prisma.userWork.count({ where }),
  ]);

  const journeys = await prisma.readingJourney.findMany({
    where: { userId, workId: { in: rows.map((row) => row.workId) } },
    select: { id: true, workId: true },
  });
  const journeyIdByWorkId = new Map(journeys.map((journey) => [journey.workId, journey.id]));

  return { items: rows.map((row) => toWorkDto(row, journeyIdByWorkId.get(row.workId) ?? null)), total };
}

export async function getWork(userId: string, workId: string): Promise<WorkSummaryDto> {
  return getUserWorkOrThrow(userId, workId);
}

export async function updateWork(userId: string, workId: string, input: UpdateWorkInput): Promise<WorkSummaryDto> {
  const existing = await prisma.userWork.findUnique({ where: { userId_workId: { userId, workId } } });
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Work not found in your library');
  }
  if (input.status) {
    await prisma.userWork.update({ where: { userId_workId: { userId, workId } }, data: { status: input.status } });
  }
  return getUserWorkOrThrow(userId, workId);
}

export async function deleteWork(userId: string, workId: string): Promise<void> {
  const existing = await prisma.userWork.findUnique({ where: { userId_workId: { userId, workId } } });
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Work not found in your library');
  }
  // Removing a work from the library removes shelf assignments and the
  // membership row only. It never touches ReadingJourney/ReadingSession —
  // reading history is personal data preserved independently of library
  // membership (SRS §6.4, §24.4).
  await prisma.shelfWork.deleteMany({ where: { userWorkId: existing.id } });
  await prisma.userWork.delete({ where: { userId_workId: { userId, workId } } });
}
