import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { prisma } from '../../config/prisma';
import { publicUrlFor, s3Client, S3_BUCKET } from '../../config/s3';
import { AppError } from '../../lib/app-error';
import { logger } from '../../lib/logger';
import { PUBLIC_PREFIX } from '../images/images.service';
import { generateSpineArt } from '../images/spine-art-client';
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
  // When the reader finished it (SRS §18.2 completion date); null unless Finished.
  finishedAt: Date | null;
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
  // Uploaded or NVIDIA-generated spine art (T-109); null until one exists
  // (the shelf falls back to its deterministic placeholder spine).
  spineImageUrl: string | null;
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
    finishedAt: userWork.finishedAt,
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
    spineImageUrl: userWork.work.spineImageUrl,
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
    // A "series" named after the book itself (Wikidata often files a famous novel as its own
    // franchise: "Dune" in "Dune") isn't a series to the reader; it only repeats the title.
    if (coverKey(discovery.seriesName) === coverKey(work.title)) return work.seriesId;

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

  const seriesWorks = userWork.work.seriesId
    ? await getSeriesSiblings(userWork.work.seriesId, userWork.work.id, userId)
    : [];

  // Books added before series discovery existed get their siblings found lazily -- in the
  // background (a third-party lookup taking seconds), so opening a book never waits on it;
  // the siblings appear on the next visit.
  const authorNames = userWork.work.authors.map((wa) => wa.author.name);
  if (seriesWorks.length === 0) {
    const work = { id: userWork.work.id, title: userWork.work.title, seriesId: userWork.work.seriesId, genres: userWork.work.genres };
    void syncRelatedSeriesWorks(work, authorNames).catch((err) => logger.warn({ err, workId: work.id }, 'Related-series discovery failed'));
  }
  // Same for a missing cover, and only one that's clearly this book (pickMatchingCover).
  if (!userWork.work.coverImageUrl) fillCoverInBackground(userWork.work.id, userWork.work.title, authorNames);
  // A spine image only ever comes from an upload or generation (T-109) --
  // never from metadata -- so the guard is simply "still missing."
  if (!userWork.work.spineImageUrl) {
    fillSpineArtInBackground(userWork.work.id, userWork.work.title, authorNames, userWork.work.language ?? userWork.work.originalLanguage);
  }

  return toWorkDto(userWork, journey?.id ?? null, seriesWorks);
}

/** Lowercase letters/digits of any script, subtitle and leading article removed. */
function coverKey(title: string): string {
  return (title.split(/\s*[:;—–(\[]/)[0] ?? title)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/^(the|a|an) /, '');
}

/**
 * The cover for a book added without one -- only from a search result that is clearly the same
 * book: the same main title and, when an author is known, a shared author surname. Otherwise no
 * cover at all (the shelf shows its cloth-cover fallback) rather than some other book's art.
 */
export function pickMatchingCover(title: string, authors: string[], candidates: { title: string; authors: string[]; coverImageUrl: string | null }[]): string | null {
  const want = coverKey(title);
  if (!want) return null;
  const surnames = authors.map((a) => coverKey(a).split(' ').pop()).filter((s): s is string => Boolean(s && s.length >= 2));
  const match = candidates.find(
    (c) =>
      c.coverImageUrl &&
      coverKey(c.title) === want &&
      (surnames.length === 0 || c.authors.some((a) => surnames.some((s) => coverKey(a).split(' ').includes(s)))),
  );
  return match?.coverImageUrl ?? null;
}

function fillCoverInBackground(workId: string, title: string, authors: string[]): void {
  void (async () => {
    const candidates = await searchBookMetadata(authors[0] ? `${title} ${authors[0]}` : title);
    const cover = pickMatchingCover(title, authors, candidates);
    // Only fills a cover that is still missing and still metadata-sourced -- a
    // reader's own upload or generated art (T-109) is never overwritten, even
    // if this lookup, started before either existed, finishes after them.
    if (cover) {
      await prisma.work.updateMany({
        where: { id: workId, coverImageUrl: null, coverImageSource: 'metadata' },
        data: { coverImageUrl: cover },
      });
    }
  })().catch((err) => logger.warn({ err, workId }, 'Cover lookup failed'));
}

/**
 * Generates spine art for a book with no spine/cover image supplied
 * (T-109) -- best-effort, same "never blocks the reader" shape as
 * fillCoverInBackground. A failure (including the live-verified case of
 * NVIDIA's shared image models timing out or being unavailable) simply
 * leaves the deterministic placeholder (frontend's spine-style.ts) in
 * place; nothing here is shown to the reader as an error.
 */
function fillSpineArtInBackground(workId: string, title: string, authors: string[], language: string | null): void {
  void (async () => {
    const result = await generateSpineArt(title, authors, language);
    if (!result) return;

    const storageKey = `${PUBLIC_PREFIX}/generated/${randomUUID()}.jpg`;
    await s3Client.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: storageKey, Body: result.image, ContentType: 'image/jpeg' }));

    // Only fills a spine image that is still missing -- an upload or an
    // earlier generation (another request racing this one) wins.
    await prisma.work.updateMany({
      where: { id: workId, spineImageUrl: null },
      data: { spineImageUrl: publicUrlFor(storageKey) },
    });
  })().catch((err) => logger.warn({ err, workId }, 'Spine art generation failed'));
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

    const newCover = input.coverImageUrl ?? null;
    if (!newCover && !work.coverImageUrl) fillCoverInBackground(work.id, input.title, input.authors);

    if (!work.coverImageUrl && newCover) {
      updateData.coverImageUrl = newCover;
      updateData.coverImageSource = input.coverImageSource ?? 'metadata';
      work.coverImageUrl = newCover;
    }
    if (!work.spineImageUrl && input.spineImageUrl) {
      updateData.spineImageUrl = input.spineImageUrl;
      work.spineImageUrl = input.spineImageUrl;
    } else if (!work.spineImageUrl) {
      fillSpineArtInBackground(work.id, input.title, input.authors, input.language ?? input.originalLanguage ?? null);
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

    const coverImageUrl = input.coverImageUrl ?? null;
    const spineImageUrl = input.spineImageUrl ?? null;

    work = await prisma.work.create({
      data: {
        title: input.title,
        seriesId: series?.id ?? null,
        genres: input.genres,
        description,
        coverImageUrl,
        coverImageSource: coverImageUrl ? (input.coverImageSource ?? 'metadata') : 'metadata',
        spineImageUrl,
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

    // Discover and link related works in the same series or universe, and find a cover when
    // none was given. Both are slow third-party lookups (seconds), so they run after the book
    // is saved instead of holding up the reader's "Add".
    const created = { id: work.id, title: work.title, seriesId: work.seriesId, genres: work.genres };
    void syncRelatedSeriesWorks(created, input.authors).catch((err) =>
      logger.warn({ err, workId: created.id }, 'Related-series discovery failed'),
    );
    if (!coverImageUrl) fillCoverInBackground(work.id, input.title, input.authors);
    if (!spineImageUrl) {
      fillSpineArtInBackground(work.id, input.title, input.authors, input.language ?? input.originalLanguage ?? null);
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
    // Every word must appear in the title or an author ("ishiguro klara") (R4-09).
    ...(query.q
      ? {
          work: {
            AND: query.q
              .trim()
              .split(/\s+/)
              .slice(0, 8)
              .map((word) => ({
                OR: [
                  { title: { contains: word, mode: 'insensitive' as const } },
                  { authors: { some: { author: { name: { contains: word, mode: 'insensitive' as const } } } } },
                ],
              })),
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
  const status = input.status ?? existing.status;
  if (input.finishedAt && input.finishedAt.getTime() > Date.now() + 86_400_000) {
    throw new AppError('VALIDATION_ERROR', "A book can't be finished in the future");
  }
  if (input.finishedAt !== undefined && status !== 'FINISHED') {
    throw new AppError('VALIDATION_ERROR', 'Only a finished book has a finish date');
  }
  const statusChanged = input.status !== undefined && input.status !== existing.status;
  if (statusChanged || input.finishedAt !== undefined) {
    // Becoming Finished is dated now unless a date (or null, "don't know") is given; any
    // other status has no finish date.
    const finishedAt =
      status !== 'FINISHED' ? null : input.finishedAt !== undefined ? input.finishedAt : statusChanged ? new Date() : existing.finishedAt;
    await prisma.userWork.update({
      where: { userId_workId: { userId, workId } },
      data: { status, finishedAt },
    });
  }
  return getUserWorkOrThrow(userId, workId);
}

/**
 * Opening or logging a session for a book still marked Want to Read means it's being read
 * (SRS §6.2, automatic where possible). Finished and Did Not Finish stay: that's a reread.
 */
export async function markReadingIfWanted(userId: string, workId: string): Promise<void> {
  await prisma.userWork.updateMany({ where: { userId, workId, status: 'WANT_TO_READ' }, data: { status: 'READING' } });
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
  // A book soundtrack is library configuration, not reading history.
  await prisma.soundtrackMapping.deleteMany({ where: { userId, targetType: 'WORK', targetKey: workId } });
  await prisma.userWork.delete({ where: { userId_workId: { userId, workId } } });
}
