import type { ToolCapability } from '../../../execution/ToolCapability';
import type { ExecutionStep } from '../../../execution/ExecutionStep';
import type { DomainTools } from '../../../domain/DomainPack';
import { toStatus } from '../data/status';

// Parameter names come from the core planner's table (PlanningEngine): bookId/bookName and
// collectionName/name are filled from targets; rating, status and the Text keys from parameters.

const meta = (
  id: string,
  description: string,
  entityTypes: string[],
  params: { name: string; type: string; required: boolean }[],
): ToolCapability => ({
  id,
  supportedIntent: id,
  supportedEntityTypes: entityTypes,
  executionPolicy: 'SEQUENTIAL',
  requiredParameters: params.filter((p) => p.required).map((p) => p.name),
  optionalParameters: params.filter((p) => !p.required).map((p) => p.name),
  description,
  parameters: params,
});

const book = { name: 'bookId', type: 'string', required: true };

const metadata: ToolCapability[] = [
  meta('add_book', "Finds a book and adds it to the reader's library", ['Library'], [{ name: 'bookName', type: 'string', required: true }]),
  meta('remove_book', "Removes a book from the reader's library", ['Book'], [book]),
  meta('update_status', "Sets a book's reading status", ['Book'], [book, { name: 'status', type: 'string', required: true }]),
  meta('create_review', 'Rates and/or reviews a book', ['Book'], [
    book,
    { name: 'rating', type: 'number', required: false },
    { name: 'reviewText', type: 'string', required: false },
  ]),
  meta('delete_review', "Deletes the reader's rating and review of a book", ['Book'], [book]),
  meta('add_note', 'Adds a note to a book', ['Book'], [book, { name: 'content', type: 'string', required: true }]),
  meta('search_library', "Searches the reader's library", [], [{ name: 'searchValue', type: 'string', required: true }]),
  meta('library_question', "Answers a question about the reader's library", [], [{ name: 'question', type: 'string', required: false }]),
  meta('recommend_books', 'Suggests what to read next', [], [{ name: 'query', type: 'string', required: false }]),
  meta('create_shelf', 'Creates a shelf', ['Collection'], [{ name: 'name', type: 'string', required: true }]),
  meta('add_to_shelf', 'Puts a book on a shelf', ['Collection', 'Book'], [
    { name: 'collectionName', type: 'string', required: true },
    book,
  ]),
  meta('remove_from_shelf', 'Takes a book off a shelf', ['Collection', 'Book'], [
    { name: 'collectionName', type: 'string', required: true },
    book,
  ]),
];

interface Target {
  type?: string;
  name?: string;
}

const isType = (t: Target, type: string) => String(t.type ?? '').toLowerCase() === type.toLowerCase();

/** A step's parameters arrive as a {name: value} record after the core resolves them, or as the raw list. */
function paramReader(step: ExecutionStep) {
  const raw = step.input.parameters as unknown;
  return (name: string, type?: string): unknown => {
    if (Array.isArray(raw)) {
      const found = (raw as { name?: string; type?: string; value?: unknown }[]).find(
        (p) => p && (p.name === name || (type && String(p.type).toLowerCase() === type.toLowerCase())),
      );
      return found?.value;
    }
    const record = (raw ?? {}) as Record<string, unknown>;
    return record[name] !== undefined ? record[name] : type ? record[type.toLowerCase()] : undefined;
  };
}

/** "remove from shelf" vs "put on shelf": the intent's own Boolean says which (false = remove). */
function chooseTool(capabilityId: string, targetsOrInput?: unknown[] | Record<string, unknown>): string | undefined {
  if (capabilityId !== 'organize-shelf') return undefined;
  const parameters = Array.isArray(targetsOrInput) ? [] : ((targetsOrInput?.parameters as unknown) ?? []);
  const list = Array.isArray(parameters) ? (parameters as { type?: string; value?: unknown }[]) : [];
  const record = Array.isArray(parameters) ? {} : (parameters as Record<string, unknown>);
  const flag = list.find((p) => String(p?.type ?? '').toLowerCase() === 'boolean')?.value ?? record.boolean;
  return flag === false || flag === 'false' ? 'remove_from_shelf' : 'add_to_shelf';
}

function buildInput(step: ExecutionStep): Record<string, unknown> | undefined {
  const targets = ((step.input.targets as Target[]) || []).filter(Boolean);
  const get = paramReader(step);
  const bookTarget = targets.find((t) => isType(t, 'Book'));
  const shelfTarget = targets.find((t) => isType(t, 'Collection'));
  const libraryTarget = targets.find((t) => isType(t, 'Library'));
  const bookId = () => {
    const v = get('bookId');
    return v !== undefined && v !== '' ? String(v) : (bookTarget?.name ?? '');
  };
  const text = (key: string) => {
    const v = get(key, 'Text');
    return v === undefined || v === null ? undefined : String(v);
  };

  switch (step.toolName) {
    case 'add_book':
      return { bookName: String(get('bookName') ?? libraryTarget?.name ?? bookTarget?.name ?? '') };
    case 'remove_book':
    case 'delete_review':
      return { bookId: bookId() };
    case 'update_status': {
      const raw = get('status', 'Status');
      // Keep what the reader said when it isn't a Bunko status ("paused"), so the tool can explain.
      return { bookId: bookId(), status: toStatus(raw) ?? String(raw ?? '') };
    }
    case 'create_review': {
      const rating = get('rating', 'Rating');
      return {
        bookId: bookId(),
        rating: rating === undefined || rating === null || rating === '' ? undefined : Number(rating),
        reviewText: text('reviewText'),
      };
    }
    case 'add_note':
      return { bookId: bookId(), content: text('content') ?? '' };
    case 'search_library':
      return { searchValue: text('searchValue') ?? '' };
    case 'library_question':
      return { question: text('question') ?? '' };
    case 'recommend_books':
      return { query: [text('query'), bookTarget?.name].filter(Boolean).join(' ') || undefined };
    case 'create_shelf':
      return { name: String(get('name') ?? shelfTarget?.name ?? '') };
    case 'add_to_shelf':
    case 'remove_from_shelf':
      return { collectionName: String(get('collectionName') ?? shelfTarget?.name ?? ''), bookId: bookId() };
  }
  return undefined;
}

export const bookTools: DomainTools = {
  metadata,
  capabilityTools: {
    'add-book': 'add_book',
    'remove-book': 'remove_book',
    'set-status': 'update_status',
    'review-book': 'create_review',
    'delete-review': 'delete_review',
    'add-note': 'add_note',
    'search-library': 'search_library',
    'library-question': 'library_question',
    'recommend-books': 'recommend_books',
    'create-shelf': 'create_shelf',
  },
  multiToolCapabilities: {
    'organize-shelf': ['add_to_shelf', 'remove_from_shelf'],
  },
  chooseTool,
  buildInput,
  textParamKeyByTool: {
    add_note: 'content',
    search_library: 'searchValue',
    library_question: 'question',
    recommend_books: 'query',
  },
  defaultTextParamKey: 'reviewText',
  // Never act on "it" from an older message for these: they delete things.
  noReferenceFallbackTools: ['remove_book', 'delete_review', 'remove_from_shelf'],
};
