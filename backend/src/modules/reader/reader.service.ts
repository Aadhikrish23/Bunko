import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { prisma } from '../../config/prisma';
import { s3Client, S3_BUCKET } from '../../config/s3';
import { AppError } from '../../lib/app-error';
import * as sessionsService from '../reading-sessions/reading-sessions.service';
import type { ChapterGraph } from './chapter-graph';
import { indexEpub } from './epub-indexer';
import { indexPdf } from './pdf-indexer';

const FILE_URL_EXPIRY_SECONDS = 3600;

export interface ReaderManifestDto {
  fileUrl: string;
  startPosition: string | null;
  confidence: number | null;
  sessionId: string;
}

async function ensureIndexed(
  edition: { id: string; format: string; chapterGraph: unknown },
  digitalFile: { storageKey: string },
): Promise<ChapterGraph> {
  if (edition.chapterGraph) {
    return edition.chapterGraph as ChapterGraph;
  }

  const object = await s3Client.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: digitalFile.storageKey }));
  if (!object.Body) {
    throw new AppError('UNSUPPORTED_FILE', 'Digital file is empty');
  }
  const buffer = Buffer.from(await object.Body.transformToByteArray());

  const chapterGraph = edition.format === 'EPUB' ? indexEpub(buffer) : await indexPdf(buffer);
  await prisma.edition.update({ where: { id: edition.id }, data: { chapterGraph: chapterGraph as object } });

  return chapterGraph;
}

// Phase 4 resolves a start position only within the SAME edition (resume
// where a previous session on this exact copy left off). Cross-edition
// mapping — a canonical position recorded on a *different* edition or
// format — is the continuity engine, Phase 5 (SRS §11.7); this function
// is the seam that phase extends.
async function resolveStartPosition(
  userId: string,
  editionId: string,
): Promise<{ startPosition: string | null; confidence: number | null }> {
  const lastSession = await prisma.readingSession.findFirst({
    where: { userId, copy: { editionId } },
    orderBy: { updatedAt: 'desc' },
  });
  if (!lastSession) {
    return { startPosition: null, confidence: null };
  }
  const position = lastSession.endPosition ?? lastSession.startPosition;
  return { startPosition: position, confidence: position ? 1.0 : null };
}

// Resolves the signed file URL, the last saved position for this user,
// and auto-starts a reading session (SRS §12.8 step 2) — the request
// flow documented in ARCHITECTURE.md §4.
export async function getReaderManifest(userId: string, editionId: string): Promise<ReaderManifestDto> {
  const copy = await prisma.copy.findFirst({
    where: { editionId, userId },
    include: { edition: true, digitalFile: true },
    orderBy: { acquiredAt: 'desc' },
  });
  if (!copy || !copy.digitalFile) {
    throw new AppError('NOT_FOUND', 'No digital copy of this edition in your library');
  }
  if (copy.edition.format === 'PHYSICAL') {
    throw new AppError('VALIDATION_ERROR', 'This edition is physical and has no reader manifest');
  }

  await ensureIndexed(copy.edition, copy.digitalFile);

  const { startPosition, confidence } = await resolveStartPosition(userId, editionId);

  const fileUrl = await getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: S3_BUCKET, Key: copy.digitalFile.storageKey }),
    { expiresIn: FILE_URL_EXPIRY_SECONDS },
  );

  const session = await sessionsService.startSession(userId, { copyId: copy.id, startPosition });

  return { fileUrl, startPosition, confidence, sessionId: session.id };
}
