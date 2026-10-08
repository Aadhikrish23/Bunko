import type { Note } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/app-error';
import type { CreateNoteInput, UpdateNoteInput } from './notes.schema';

export interface NoteDto {
  id: string;
  workId: string;
  copyId: string | null;
  sessionId: string | null;
  scope: 'BOOK' | 'CHAPTER' | 'SECTION' | 'PAGE' | 'PASSAGE' | 'SESSION';
  position: string | null;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}

export function toNoteDto(note: Note): NoteDto {
  return {
    id: note.id,
    workId: note.workId,
    copyId: note.copyId,
    sessionId: note.sessionId,
    scope: note.scope,
    position: note.position,
    body: note.body,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

// Same "does this user have this work in their library" check
// library.service.ts already uses (getUserWorkOrThrow).
async function requireOwnWork(userId: string, workId: string): Promise<void> {
  const membership = await prisma.userWork.findUnique({ where: { userId_workId: { userId, workId } } });
  if (!membership) {
    throw new AppError('NOT_FOUND', 'Work not found in your library');
  }
}

async function requireOwnNote(userId: string, id: string): Promise<Note> {
  const note = await prisma.note.findFirst({ where: { id, userId } });
  if (!note) {
    throw new AppError('NOT_FOUND', 'Note not found');
  }
  return note;
}

export async function listNotes(userId: string, workId: string): Promise<NoteDto[]> {
  await requireOwnWork(userId, workId);
  const rows = await prisma.note.findMany({ where: { workId, userId }, orderBy: { createdAt: 'desc' } });
  return rows.map(toNoteDto);
}

export async function createNote(userId: string, workId: string, input: CreateNoteInput): Promise<NoteDto> {
  await requireOwnWork(userId, workId);

  // An edition-scoped note's copyId must actually be the caller's own
  // copy of *this* work — not just any copy they own.
  if (input.copyId) {
    const copy = await prisma.copy.findFirst({
      where: { id: input.copyId, userId, edition: { workId } },
    });
    if (!copy) {
      throw new AppError('NOT_FOUND', 'Copy not found in your library for this work');
    }
  }

  if (input.sessionId) {
    const session = await prisma.readingSession.findFirst({ where: { id: input.sessionId, userId } });
    if (!session) {
      throw new AppError('NOT_FOUND', 'Reading session not found');
    }
  }

  const note = await prisma.note.create({
    data: {
      userId,
      workId,
      copyId: input.copyId ?? null,
      sessionId: input.sessionId ?? null,
      scope: input.scope,
      position: input.position ?? null,
      body: input.body,
    },
  });
  return toNoteDto(note);
}

export async function updateNote(userId: string, id: string, input: UpdateNoteInput): Promise<NoteDto> {
  await requireOwnNote(userId, id);
  const updated = await prisma.note.update({ where: { id }, data: { body: input.body } });
  return toNoteDto(updated);
}

export async function deleteNote(userId: string, id: string): Promise<void> {
  await requireOwnNote(userId, id);
  await prisma.note.delete({ where: { id } });
}
