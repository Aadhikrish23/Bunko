import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/app-error';
import type { CreateWorkInput, ListWorksQuery, UpdateWorkInput } from './library.schema';

export interface WorkSummaryDto {
  id: string;
  title: string;
  authors: string[];
  status: string;
  editions: { id: string; format: string; publisher: string | null }[];
}

const USER_WORK_INCLUDE = {
  work: {
    include: {
      authors: { include: { author: true } },
      editions: true,
    },
  },
} satisfies Prisma.UserWorkInclude;

type UserWorkWithRelations = Prisma.UserWorkGetPayload<{ include: typeof USER_WORK_INCLUDE }>;

function toWorkDto(userWork: UserWorkWithRelations): WorkSummaryDto {
  return {
    id: userWork.work.id,
    title: userWork.work.title,
    authors: userWork.work.authors.map((wa) => wa.author.name),
    status: userWork.status,
    editions: userWork.work.editions.map((edition) => ({
      id: edition.id,
      format: edition.format,
      publisher: edition.publisher,
    })),
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
  const userWork = await prisma.userWork.findUnique({
    where: { userId_workId: { userId, workId } },
    include: USER_WORK_INCLUDE,
  });
  if (!userWork) {
    throw new AppError('NOT_FOUND', 'Work not found in your library');
  }
  return toWorkDto(userWork);
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
      include: USER_WORK_INCLUDE,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      orderBy: { addedAt: 'desc' },
    }),
    prisma.userWork.count({ where }),
  ]);

  return { items: rows.map(toWorkDto), total };
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
