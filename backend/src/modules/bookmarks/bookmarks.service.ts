import { Prisma, type Bookmark } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/app-error';
import type { CreateBookmarkInput } from './bookmarks.schema';

export interface BookmarkDto {
  id: string;
  copyId: string;
  position: string;
  label: string;
  createdAt: Date;
}

function toDto(bookmark: Bookmark): BookmarkDto {
  return {
    id: bookmark.id,
    copyId: bookmark.copyId,
    position: bookmark.position,
    label: bookmark.label,
    createdAt: bookmark.createdAt,
  };
}

// Same edition -> own-copy resolution as annotations.service.ts.
async function requireOwnCopyForEdition(userId: string, editionId: string) {
  const copy = await prisma.copy.findFirst({ where: { editionId, userId }, orderBy: { acquiredAt: 'desc' } });
  if (!copy) throw new AppError('NOT_FOUND', 'No copy of this edition in your library');
  return copy;
}

export async function listBookmarks(userId: string, editionId: string): Promise<BookmarkDto[]> {
  const copy = await requireOwnCopyForEdition(userId, editionId);
  const rows = await prisma.bookmark.findMany({ where: { userId, copyId: copy.id }, orderBy: { createdAt: 'asc' } });
  return rows.map(toDto);
}

// Returns `created: false` when a bookmark with the same client id
// already exists for this user — a retry, not a second bookmark.
export async function createBookmark(
  userId: string,
  editionId: string,
  input: CreateBookmarkInput,
  options: { createdAt?: Date } = {},
): Promise<{ bookmark: BookmarkDto; created: boolean }> {
  const copy = await requireOwnCopyForEdition(userId, editionId);
  try {
    const bookmark = await prisma.bookmark.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        ...(options.createdAt ? { createdAt: options.createdAt } : {}),
        userId,
        copyId: copy.id,
        position: input.position,
        label: input.label,
      },
    });
    return { bookmark: toDto(bookmark), created: true };
  } catch (err) {
    if (input.id && err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const existing = await prisma.bookmark.findFirst({ where: { id: input.id, userId } });
      if (existing) return { bookmark: toDto(existing), created: false };
      throw new AppError('CONFLICT', 'That bookmark id is already in use');
    }
    throw err;
  }
}

export async function deleteBookmark(userId: string, id: string): Promise<void> {
  const { count } = await prisma.bookmark.deleteMany({ where: { id, userId } });
  if (count === 0) throw new AppError('NOT_FOUND', 'Bookmark not found');
}
