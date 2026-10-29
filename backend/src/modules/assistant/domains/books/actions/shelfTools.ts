import { BaseTool } from '../../../sdk/BaseTool';
import type { AIToolContext } from '../../../sdk/AIToolContext';
import type { AIToolResult } from '../../../sdk/AIToolResult';
import { prisma } from '../../../../../config/prisma';
import { assignWorkToShelf, createShelf, removeWorkFromShelf } from '../../../../shelves/shelves.service';
import { loadShelves } from '../data/library';
import { matchShelf } from '../text/match';
import { ownBook } from './libraryTools';

/**
 * "Sci-fi", "sci fi shelf", "my scifi list" -> the shelf name to store: as
 * typed, trimmed. No longer strips a trailing "shelf"/"shelves" (R10-03):
 * by the time a Collection target reaches a tool, normalizePlan
 * (planChecks.ts) has already resolved that question with the full
 * original message as context -- something this function doesn't have --
 * including restoring a name the reader chose that itself ends in the
 * word "shelf" ("Alpha Shelf"), which this function used to then strip
 * right back off again.
 */
function cleanShelfName(raw: string): string {
  const name = raw
    .replace(/^\s*(my|the|a|an|new)\s+/i, '')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .trim()
    .slice(0, 80);
  // Typed in all lowercase ("comfort reads"): capitalise it like a shelf name. Any other
  // casing ("sci-FI", "TBR 2026") is the reader's choice and kept.
  return name === name.toLowerCase() ? name.replace(/(^|[\s-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase()) : name;
}

export class CreateShelfTool extends BaseTool<{ name: string }, { shelfId: string; name: string }> {
  readonly category = 'shelves';
  readonly name = 'create_shelf';
  readonly description = 'Creates a new shelf.';

  async execute(input: { name: string }, context: AIToolContext): Promise<AIToolResult<{ shelfId: string; name: string }>> {
    const name = cleanShelfName(input.name || '');
    if (!name) return this.failure('What should the new shelf be called?');
    const existing = matchShelf(name, await loadShelves(context.userId));
    if (existing) {
      return this.success({ shelfId: existing.id, name: existing.name }, `You already have a shelf called "${existing.name}".`, { alreadyExists: true });
    }
    const shelf = await createShelf(context.userId, { name });
    return this.success({ shelfId: shelf.id, name: shelf.name }, `I've created the shelf "${shelf.name}".`, { created: true });
  }
}

interface ShelfMove {
  collectionName: string;
  bookId: string;
}

export class AddToShelfTool extends BaseTool<ShelfMove, { title: string; workId: string; shelf: string }> {
  readonly category = 'shelves';
  readonly name = 'add_to_shelf';
  readonly description = 'Puts a book on a shelf, creating the shelf if it does not exist yet.';

  async execute(input: ShelfMove, context: AIToolContext): Promise<AIToolResult<{ title: string; workId: string; shelf: string }>> {
    const own = await ownBook(context.userId, input.bookId);
    if (!own) return this.failure("That book isn't in your library.");
    const name = cleanShelfName(input.collectionName || '');
    if (!name) return this.failure(`Which shelf should ${own.work.title} go on?`);
    let shelf = matchShelf(name, await loadShelves(context.userId));
    let created = false;
    if (!shelf) {
      shelf = await createShelf(context.userId, { name });
      created = true;
    }
    const already = await prisma.shelfWork.findFirst({ where: { shelfId: shelf.id, userWorkId: own.id } });
    const data = { title: own.work.title, workId: own.workId, shelf: shelf.name };
    if (already) return this.success(data, `${own.work.title} is already on your "${shelf.name}" shelf.`, { alreadyOnShelf: true });
    await assignWorkToShelf(context.userId, shelf.id, { workId: own.workId });
    return this.success(
      data,
      created ? `I've created the shelf "${shelf.name}" and put ${own.work.title} on it.` : `I've put ${own.work.title} on your "${shelf.name}" shelf.`,
      { shelfId: shelf.id, createdShelf: created },
    );
  }
}

export class RemoveFromShelfTool extends BaseTool<ShelfMove, { title: string; workId: string; shelf: string }> {
  readonly category = 'shelves';
  readonly name = 'remove_from_shelf';
  readonly description = 'Takes a book off a shelf (it stays in the library).';

  async execute(input: ShelfMove, context: AIToolContext): Promise<AIToolResult<{ title: string; workId: string; shelf: string }>> {
    const own = await ownBook(context.userId, input.bookId);
    if (!own) return this.failure("That book isn't in your library.");
    const shelves = await loadShelves(context.userId);
    const shelf = matchShelf(input.collectionName || '', shelves);
    if (!shelf) {
      const names = shelves.map((s) => `"${s.name}"`).join(', ');
      return this.failure(`You don't have a shelf called "${cleanShelfName(input.collectionName || '')}".${names ? ` Your shelves are ${names}.` : ''}`);
    }
    const onIt = await prisma.shelfWork.findFirst({ where: { shelfId: shelf.id, userWorkId: own.id } });
    const data = { title: own.work.title, workId: own.workId, shelf: shelf.name };
    if (!onIt) return this.success(data, `${own.work.title} wasn't on your "${shelf.name}" shelf, so nothing changed.`, { notOnShelf: true });
    await removeWorkFromShelf(context.userId, shelf.id, own.workId);
    return this.success(data, `I've taken ${own.work.title} off your "${shelf.name}" shelf. It's still in your library.`, { shelfId: shelf.id });
  }
}
