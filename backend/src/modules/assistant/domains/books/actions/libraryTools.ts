import { BaseTool } from '../../../sdk/BaseTool';
import type { AIToolContext } from '../../../sdk/AIToolContext';
import type { AIToolResult } from '../../../sdk/AIToolResult';
import { prisma } from '../../../../../config/prisma';
import { createWork, deleteWork, updateWork } from '../../../../library/library.service';
import { searchBookMetadata, type MetadataCandidate } from '../../../../metadata/metadata.service';
import { STATUS_LABEL, isPausedWord, toStatus, type ReadingStatus } from '../data/status';
import { norm, titleScore } from '../text/match';

export interface BookResult {
  title: string;
  workId: string;
  status?: ReadingStatus;
}

/** The reader's own copy of the book: its title, or undefined when it isn't in their library. */
export async function ownBook(userId: string, workId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(workId)) return undefined;
  return prisma.userWork.findUnique({
    where: { userId_workId: { userId, workId } },
    include: { work: { select: { title: true } } },
  });
}

/** Best metadata match for what the reader asked for: title first, author as a tie-breaker. */
function bestCandidate(query: string, candidates: MetadataCandidate[]): { candidate: MetadataCandidate; score: number } | undefined {
  const [titlePart, authorPart] = query.split(/\s+by\s+/i);
  const scored = candidates.map((candidate) => {
    let score = titleScore(titlePart ?? query, candidate.title);
    if (authorPart && candidate.authors.some((a) => norm(a).includes(norm(authorPart)) || norm(authorPart).includes(norm(a)))) score += 10;
    return { candidate, score };
  });
  return scored.sort((a, b) => b.score - a.score)[0];
}

export class AddBookTool extends BaseTool<{ bookName: string; status?: string }, BookResult> {
  readonly category = 'library';
  readonly name = 'add_book';
  readonly description = "Finds a book by title (and author) and adds it to the reader's library as Want to Read.";

  async execute(input: { bookName: string; status?: string }, context: AIToolContext): Promise<AIToolResult<BookResult>> {
    const asked = (input.bookName || '').trim();
    if (!asked) return this.failure('Which book should I add?');

    const candidates = await searchBookMetadata(asked).catch(() => [] as MetadataCandidate[]);
    const best = bestCandidate(asked, candidates);
    // Never add some other book: below a confident match, say what was found instead.
    if (!best || best.score < 75) {
      const closest = candidates.slice(0, 3).map((c) => `"${c.title}"${c.authors[0] ? ` by ${c.authors[0]}` : ''}`);
      return this.failure(
        closest.length
          ? `I couldn't find a book called "${asked}". The closest were ${closest.join(', ')}. Tell me the full title (and author) and I'll add it.`
          : `I couldn't find a book called "${asked}". Check the spelling, or add the author ("${asked} by ...").`,
      );
    }

    const c = best.candidate;
    const { dto, alreadyInLibrary } = await createWork(context.userId, {
      title: c.title,
      authors: c.authors,
      genres: [],
      seriesName: c.seriesName ?? null,
      coverImageUrl: c.coverImageUrl,
      externalSource: c.externalSource,
      externalId: c.externalId,
      description: c.description ?? null,
      originalLanguage: c.originalLanguage ?? null,
      language: c.language ?? null,
      partsCount: c.partsCount ?? null,
      chaptersCount: c.chaptersCount ?? null,
    });
    const by = c.authors[0] ? ` by ${c.authors[0]}` : '';
    if (alreadyInLibrary) {
      // Not a failure: "add X and mark it read" carries on with the copy that's there.
      return this.success({ title: dto.title, workId: dto.id }, `${dto.title} is already in your library.`, { alreadyInLibrary: true });
    }
    return this.success(
      { title: dto.title, workId: dto.id, status: 'WANT_TO_READ' },
      `I've added ${dto.title}${by} to your library as Want to Read.`,
    );
  }
}

export class RemoveBookTool extends BaseTool<{ bookId: string }, BookResult> {
  readonly category = 'library';
  readonly name = 'remove_book';
  readonly description = "Removes a book from the reader's library (and its shelves). Reading history, notes and reviews are kept.";

  async execute(input: { bookId: string }, context: AIToolContext): Promise<AIToolResult<BookResult>> {
    const own = await ownBook(context.userId, input.bookId);
    if (!own) return this.failure("That book isn't in your library.");
    await deleteWork(context.userId, own.workId);
    return this.success({ title: own.work.title, workId: own.workId }, `I've removed ${own.work.title} from your library.`);
  }
}

/** "yesterday" / "last night" / an ISO date -> a Date; undefined when not given or unreadable. */
function finishedOn(when: string | undefined): Date | undefined {
  if (!when) return undefined;
  if (/^(yesterday|last night)$/i.test(when)) return new Date(Date.now() - 86_400_000);
  if (/^today$/i.test(when)) return new Date();
  const parsed = new Date(when);
  return Number.isNaN(parsed.getTime()) || parsed.getTime() > Date.now() + 86_400_000 ? undefined : parsed;
}

const dayName = (date: Date) => {
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(date).setHours(0, 0, 0, 0)) / 86_400_000);
  return days === 0 ? 'today' : days === 1 ? 'yesterday' : `on ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`;
};

export class UpdateStatusTool extends BaseTool<{ bookId: string; status: string; when?: string }, BookResult> {
  readonly category = 'library';
  readonly name = 'update_status';
  readonly description = 'Sets a book to Want to Read, Reading, Finished, or Did Not Finish.';

  async execute(input: { bookId: string; status: string; when?: string }, context: AIToolContext): Promise<AIToolResult<BookResult>> {
    const own = await ownBook(context.userId, input.bookId);
    if (!own) return this.failure("That book isn't in your library.");
    const status = toStatus(input.status);
    if (!status) {
      return this.failure(
        isPausedWord(input.status)
          ? `Bunko doesn't have a "paused" status, so ${own.work.title} stays as ${STATUS_LABEL[own.status as ReadingStatus]}. The choices are Want to Read, Reading, Finished and Did Not Finish.`
          : `I'm not sure which status you mean for ${own.work.title}. The choices are Want to Read, Reading, Finished and Did Not Finish.`,
      );
    }
    const title = own.work.title;
    if (own.status === status) {
      return this.success({ title, workId: own.workId, status }, `${title} is already marked ${STATUS_LABEL[status]}.`, { alreadyInStatus: true });
    }
    // "finished circe last night": the date it was finished, said back so it can be checked (R4-05).
    const finishedAt = status === 'FINISHED' ? finishedOn(input.when) : undefined;
    await updateWork(context.userId, own.workId, { status, ...(finishedAt ? { finishedAt } : {}) });
    const message =
      status === 'FINISHED'
        ? `I've marked ${title} as Finished${finishedAt ? `, ${dayName(finishedAt)}` : ''}. Congratulations on finishing it!`
        : `I've marked ${title} as ${STATUS_LABEL[status]}.`;
    return this.success({ title, workId: own.workId, status }, message, { previousStatus: own.status });
  }
}
