import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/app-error';
import type { CreateCopyInput, CreateEditionInput } from './editions.schema';

export interface EditionDto {
  id: string;
  format: string;
  publisher: string | null;
}

export interface CopyDto {
  id: string;
  editionId: string;
  digitalFileId: string | null;
}

// Editions are added from a work already in the caller's library — never
// for an arbitrary workId (ownership checked here via the query's where
// clause, CODING_STANDARDS.md §6, not as a separate after-the-fact check).
export async function createEdition(userId: string, input: CreateEditionInput): Promise<EditionDto> {
  const userWork = await prisma.userWork.findUnique({
    where: { userId_workId: { userId, workId: input.workId } },
  });
  if (!userWork) {
    throw new AppError('NOT_FOUND', 'Work not found in your library');
  }

  const edition = await prisma.edition.create({
    data: {
      workId: input.workId,
      format: input.format,
      publisher: input.publisher ?? null,
      language: input.language ?? null,
      isbn: input.isbn ?? null,
    },
  });

  return { id: edition.id, format: edition.format, publisher: edition.publisher };
}

export async function createCopy(userId: string, input: CreateCopyInput): Promise<CopyDto> {
  const edition = await prisma.edition.findUnique({
    where: { id: input.editionId },
    include: { work: { include: { users: { where: { userId } } } } },
  });
  if (!edition || edition.work.users.length === 0) {
    throw new AppError('NOT_FOUND', 'Edition not found in your library');
  }

  if (input.digitalFileId) {
    const conflicting = await prisma.copy.findUnique({ where: { digitalFileId: input.digitalFileId } });
    if (conflicting) {
      throw new AppError('CONFLICT', 'This digital file is already attached to another copy');
    }
  }

  const copy = await prisma.copy.create({
    data: {
      userId,
      editionId: input.editionId,
      digitalFileId: input.digitalFileId ?? null,
    },
  });

  return { id: copy.id, editionId: copy.editionId, digitalFileId: copy.digitalFileId };
}
