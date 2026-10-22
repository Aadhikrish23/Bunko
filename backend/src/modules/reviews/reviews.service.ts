import type { Review } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/app-error';
import type { UpdateReviewInput, UpsertReviewInput } from './reviews.schema';

export interface ReviewDto {
  id: string;
  workId: string;
  rating: number | null;
  body: string | null;
  isFavourite: boolean;
  rereadIntention: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toReviewDto(review: Review): ReviewDto {
  return {
    id: review.id,
    workId: review.workId,
    rating: review.rating,
    body: review.body,
    isFavourite: review.isFavourite,
    rereadIntention: review.rereadIntention,
    metadata: (review.metadata as Record<string, unknown> | null) ?? null,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  };
}

// Prisma rejects a bare `null` for a nullable Json column — it needs the
// JsonNull sentinel to distinguish "store SQL NULL" from "store JSON null".
function toJsonInput(metadata: Record<string, unknown> | null | undefined) {
  return metadata ? (metadata as Prisma.InputJsonValue) : Prisma.JsonNull;
}

// Same "does this user have this work in their library" check
// notes.service.ts / library.service.ts already use.
async function requireOwnWork(userId: string, workId: string): Promise<void> {
  const membership = await prisma.userWork.findUnique({ where: { userId_workId: { userId, workId } } });
  if (!membership) {
    throw new AppError('NOT_FOUND', 'Work not found in your library');
  }
}

async function requireOwnReview(userId: string, workId: string): Promise<Review> {
  const review = await prisma.review.findUnique({ where: { userId_workId: { userId, workId } } });
  if (!review) {
    throw new AppError('NOT_FOUND', 'Review not found');
  }
  return review;
}

export async function getOwnReview(userId: string, workId: string): Promise<ReviewDto> {
  const review = await prisma.review.findUnique({ where: { userId_workId: { userId, workId } } });
  if (!review) {
    throw new AppError('NOT_FOUND', 'Review not found');
  }
  return toReviewDto(review);
}

// Create-or-replace: re-rating/re-reviewing a work is an upsert, not a
// second row — the DB-level @@unique([userId, workId]) is what this
// relies on, so there's no separate "already reviewed" error path.
export async function upsertReview(userId: string, workId: string, input: UpsertReviewInput): Promise<ReviewDto> {
  await requireOwnWork(userId, workId);

  const review = await prisma.review.upsert({
    where: { userId_workId: { userId, workId } },
    create: {
      userId,
      workId,
      rating: input.rating ?? null,
      body: input.body ?? null,
      isFavourite: input.isFavourite ?? false,
      rereadIntention: input.rereadIntention ?? false,
      metadata: toJsonInput(input.metadata),
    },
    update: {
      rating: input.rating ?? null,
      body: input.body ?? null,
      isFavourite: input.isFavourite ?? false,
      rereadIntention: input.rereadIntention ?? false,
      metadata: toJsonInput(input.metadata),
    },
  });
  return toReviewDto(review);
}

export async function updateReview(userId: string, workId: string, input: UpdateReviewInput): Promise<ReviewDto> {
  await requireOwnReview(userId, workId);
  const updated = await prisma.review.update({
    where: { userId_workId: { userId, workId } },
    data: {
      ...(input.rating !== undefined ? { rating: input.rating } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.isFavourite !== undefined ? { isFavourite: input.isFavourite } : {}),
      ...(input.rereadIntention !== undefined ? { rereadIntention: input.rereadIntention } : {}),
      ...(input.metadata !== undefined ? { metadata: toJsonInput(input.metadata) } : {}),
    },
  });
  return toReviewDto(updated);
}

export async function deleteReview(userId: string, workId: string): Promise<void> {
  await requireOwnReview(userId, workId);
  await prisma.review.delete({ where: { userId_workId: { userId, workId } } });
}
