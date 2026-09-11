import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/app-error';
import type { CreateWorkInput, ListWorksQuery, UpdateWorkInput } from './library.schema';

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

function toWorkDto(userWork: UserWorkWithRelations, journeyId: string | null): WorkSummaryDto {
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
  };
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
  return toWorkDto(userWork, journey?.id ?? null);
}

export async function createWork(
  userId: string,
  input: CreateWorkInput,
): Promise<{ dto: WorkSummaryDto; alreadyInLibrary: boolean }> {
  let work = input.externalSource && input.externalId
    ? await prisma.work.findUnique({
        where: {
          externalSource_externalId: { externalSource: input.externalSource, externalId: input.externalId },
        },
      })
    : null;

  if (!work) {
    const series = input.seriesName ? await findOrCreateSeries(input.seriesName) : null;

    work = await prisma.work.create({
      data: {
        title: input.title,
        seriesId: series?.id ?? null,
        genres: input.genres,
        coverImageUrl: input.coverImageUrl ?? null,
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
