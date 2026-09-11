import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/app-error';
import type { AssignWorkInput, CreateShelfInput } from './shelves.schema';

export interface ShelfDto {
  id: string;
  name: string;
}

export async function listShelves(userId: string): Promise<ShelfDto[]> {
  const shelves = await prisma.shelf.findMany({ where: { userId }, orderBy: { name: 'asc' } });
  return shelves.map((shelf) => ({ id: shelf.id, name: shelf.name }));
}

export async function createShelf(userId: string, input: CreateShelfInput): Promise<ShelfDto> {
  // Name uniqueness per user (T-016) is enforced by @@unique([userId, name])
  // — a collision surfaces as Prisma P2002, mapped to 409 CONFLICT by the
  // global error handler.
  const shelf = await prisma.shelf.create({ data: { userId, name: input.name } });
  return { id: shelf.id, name: shelf.name };
}

async function requireOwnShelf(userId: string, shelfId: string) {
  const shelf = await prisma.shelf.findFirst({ where: { id: shelfId, userId } });
  if (!shelf) {
    throw new AppError('NOT_FOUND', 'Shelf not found');
  }
  return shelf;
}

export async function deleteShelf(userId: string, shelfId: string): Promise<void> {
  await requireOwnShelf(userId, shelfId);
  // Assigning/removing a work from one shelf must not affect others
  // (T-016) — deleting a shelf only ever touches its own ShelfWork rows.
  await prisma.shelfWork.deleteMany({ where: { shelfId } });
  await prisma.shelf.delete({ where: { id: shelfId } });
}

export async function assignWorkToShelf(userId: string, shelfId: string, input: AssignWorkInput): Promise<void> {
  await requireOwnShelf(userId, shelfId);

  const userWork = await prisma.userWork.findUnique({
    where: { userId_workId: { userId, workId: input.workId } },
  });
  if (!userWork) {
    throw new AppError('NOT_FOUND', 'Work not found in your library');
  }

  await prisma.shelfWork.upsert({
    where: { shelfId_userWorkId: { shelfId, userWorkId: userWork.id } },
    create: { shelfId, userWorkId: userWork.id },
    update: {},
  });
}

export async function removeWorkFromShelf(userId: string, shelfId: string, workId: string): Promise<void> {
  await requireOwnShelf(userId, shelfId);

  const userWork = await prisma.userWork.findUnique({ where: { userId_workId: { userId, workId } } });
  if (!userWork) {
    return; // nothing to remove — a no-op is the safe idempotent outcome here
  }

  await prisma.shelfWork.deleteMany({ where: { shelfId, userWorkId: userWork.id } });
}
