import type { ContextProvider } from '../../../context/ContextProvider';
import { ContextCategory } from '../../../context/ContextCategory';
import type { ContextRequest } from '../../../context/ContextRequest';
import type { ContextResult } from '../../../context/ContextResult';
import type { ContextFact } from '../../../context/ContextFact';
import type { ContextProviderRegistry } from '../../../context/ContextProviderRegistry';
import { IntentTargetType } from '../../../intent/IntentTargetType';
import { loadLibrary, loadShelves, type BookRecord } from '../data/library';
import { rankByTitle } from '../text/match';

// What the planner may read about the reader for the books a request names: their library
// entry, their review, their shelves. Only ever the requesting reader's own data.

const fact = (category: ContextCategory, value: unknown, confidence = 1): ContextFact => ({
  category,
  value,
  confidence,
  source: 'BunkoLibrary',
  timestamp: new Date(),
});

function namedBooks(request: ContextRequest, books: BookRecord[]): BookRecord[] {
  return request.targets
    .filter((t) => t.type === IntentTargetType.Book)
    .map((t) => rankByTitle(t.name, books)[0])
    .filter((r): r is { item: BookRecord; score: number } => Boolean(r && r.score >= 80))
    .map((r) => r.item);
}

class LibraryContextProvider implements ContextProvider {
  readonly category = ContextCategory.Library;
  async build(request: ContextRequest): Promise<ContextResult> {
    const books = await loadLibrary(request.userId);
    const facts = namedBooks(request, books).map((b) =>
      fact(this.category, { title: b.title, authors: b.authors, status: b.status, shelves: b.shelves.map((s) => s.name) }),
    );
    return { category: this.category, facts };
  }
}

class ReviewContextProvider implements ContextProvider {
  readonly category = ContextCategory.Reviews;
  async build(request: ContextRequest): Promise<ContextResult> {
    const books = await loadLibrary(request.userId);
    const facts = namedBooks(request, books).map((b) => fact(this.category, { title: b.title, rating: b.rating, hasReview: Boolean(b.reviewBody) }));
    return { category: this.category, facts };
  }
}

class ShelfContextProvider implements ContextProvider {
  readonly category = ContextCategory.Collections;
  async build(request: ContextRequest): Promise<ContextResult> {
    const shelves = await loadShelves(request.userId);
    return { category: this.category, facts: shelves.map((s) => fact(this.category, { name: s.name })) };
  }
}

export function registerContextProviders(registry: ContextProviderRegistry): void {
  for (const provider of [new LibraryContextProvider(), new ReviewContextProvider(), new ShelfContextProvider()]) {
    try {
      registry.register(provider);
    } catch {
      // Already registered (the registry is a process-wide singleton).
    }
  }
}
