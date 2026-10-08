import type { Annotation } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/app-error';
import type { CreateAnnotationInput, UpdateAnnotationInput } from './annotations.schema';

export interface AnnotationDto {
  id: string;
  copyId: string;
  sessionId: string | null;
  kind: 'HIGHLIGHT' | 'QUOTE';
  position: string;
  text: string;
  color: string | null;
  note: string | null;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

function toDto(annotation: Annotation): AnnotationDto {
  return {
    id: annotation.id,
    copyId: annotation.copyId,
    sessionId: annotation.sessionId,
    kind: annotation.kind,
    position: annotation.position,
    text: annotation.text,
    color: annotation.color,
    note: annotation.note,
    tags: annotation.tags,
    createdAt: annotation.createdAt,
    updatedAt: annotation.updatedAt,
  };
}

// Same ownership-resolution pattern as reader.service.ts: the caller
// names an edition, we resolve it to their own copy of it. Most recently
// acquired copy wins if somehow more than one exists, matching reader.service.ts.
async function requireOwnCopyForEdition(userId: string, editionId: string) {
  const copy = await prisma.copy.findFirst({
    where: { editionId, userId },
    orderBy: { acquiredAt: 'desc' },
  });
  if (!copy) {
    throw new AppError('NOT_FOUND', 'No digital copy of this edition in your library');
  }
  return copy;
}

async function requireOwnAnnotation(userId: string, id: string): Promise<Annotation> {
  const annotation = await prisma.annotation.findFirst({ where: { id, userId } });
  if (!annotation) {
    throw new AppError('NOT_FOUND', 'Annotation not found');
  }
  return annotation;
}

export async function listAnnotations(userId: string, editionId: string): Promise<AnnotationDto[]> {
  const copy = await requireOwnCopyForEdition(userId, editionId);
  const rows = await prisma.annotation.findMany({
    where: { copyId: copy.id, userId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toDto);
}

export async function createAnnotation(
  userId: string,
  editionId: string,
  input: CreateAnnotationInput,
): Promise<AnnotationDto> {
  const copy = await requireOwnCopyForEdition(userId, editionId);

  // A caller-supplied sessionId must actually be this user's own session
  // — otherwise an annotation could be pinned to someone else's session
  // row, which would then leak into their journal (T-049).
  if (input.sessionId) {
    const session = await prisma.readingSession.findFirst({ where: { id: input.sessionId, userId } });
    if (!session) {
      throw new AppError('NOT_FOUND', 'Reading session not found');
    }
  }

  const annotation = await prisma.annotation.create({
    data: {
      userId,
      copyId: copy.id,
      sessionId: input.sessionId ?? null,
      kind: input.kind,
      position: input.position,
      text: input.text,
      color: input.color ?? null,
      note: input.note ?? null,
      tags: input.tags ?? [],
    },
  });
  return toDto(annotation);
}

export async function updateAnnotation(
  userId: string,
  id: string,
  input: UpdateAnnotationInput,
): Promise<AnnotationDto> {
  await requireOwnAnnotation(userId, id);
  const updated = await prisma.annotation.update({
    where: { id },
    data: {
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
    },
  });
  return toDto(updated);
}

export async function deleteAnnotation(userId: string, id: string): Promise<void> {
  await requireOwnAnnotation(userId, id);
  await prisma.annotation.delete({ where: { id } });
}
