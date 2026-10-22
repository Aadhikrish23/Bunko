import { ToolRegistry } from '../../registry/ToolRegistry';
import type { AITool } from '../../sdk/AITool';
import { AppError } from '../../../../lib/app-error';
import { logger } from '../../../../lib/logger';
import capabilityRegistry from '../../planning/CapabilityRegistry';
import { ContextCategory } from '../../context/ContextCategory';
import type { Capability } from '../../planning/Capability';
import { AddBookTool, RemoveBookTool, UpdateStatusTool } from './actions/libraryTools';
import { AddNoteTool, CreateReviewTool, DeleteReviewTool } from './actions/reviewTools';
import { AddToShelfTool, CreateShelfTool, RemoveFromShelfTool } from './actions/shelfTools';
import { LibraryQuestionTool, RecommendBooksTool, SearchLibraryTool } from './actions/readTools';
import { BookIntent } from './intent/BookIntent';

/**
 * A service error inside a tool (a book deleted a moment ago, a shelf name clash) becomes that
 * step's failure sentence instead of failing the whole message; unexpected errors are logged.
 */
function safely(tool: AITool): AITool {
  const execute = tool.execute.bind(tool);
  tool.execute = async (input, context) => {
    try {
      return await execute(input, context);
    } catch (err) {
      if (err instanceof AppError) return { success: false, status: 'FAILED', error: err.message, errors: [err.message] };
      logger.error({ err, tool: tool.name }, 'Assistant tool failed');
      const message = "Something went wrong on my side with that, so I didn't change it. Please try again.";
      return { success: false, status: 'FAILED', error: message, errors: [message] };
    }
  };
  return tool;
}

export function createToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  for (const tool of [
    new AddBookTool(),
    new RemoveBookTool(),
    new UpdateStatusTool(),
    new CreateReviewTool(),
    new DeleteReviewTool(),
    new AddNoteTool(),
    new SearchLibraryTool(),
    new LibraryQuestionTool(),
    new RecommendBooksTool(),
    new CreateShelfTool(),
    new AddToShelfTool(),
    new RemoveFromShelfTool(),
  ]) {
    registry.register(safely(tool as AITool));
  }
  return registry;
}

const library = [{ contextCategory: ContextCategory.Library }];

const CAPABILITIES: Capability[] = [
  { id: 'add-book', name: 'Add Book', description: "Finds a book by title (and author) and adds it to the reader's library as Want to Read.", intentType: BookIntent.AddBook, requirements: library },
  { id: 'remove-book', name: 'Remove Book', description: "Removes a book from the reader's library, only when they ask to remove or delete it.", intentType: BookIntent.RemoveBook, requirements: library },
  {
    id: 'set-status',
    name: 'Set Reading Status',
    description: "Changes a book's status: Want to Read, Reading, Finished, or Did Not Finish.",
    intentType: BookIntent.SetStatus,
    extraIntentTypes: [BookIntent.StartBook, BookIntent.FinishBook, BookIntent.DnfBook],
    requirements: library,
  },
  {
    id: 'review-book',
    name: 'Rate or Review Book',
    description: 'Rates a book from 1 to 5 stars and/or saves the reader\'s review text.',
    intentType: BookIntent.RateBook,
    extraIntentTypes: [BookIntent.ReviewBook],
    requirements: [{ contextCategory: ContextCategory.Reviews }, ...library],
  },
  { id: 'delete-review', name: 'Delete Review', description: "Deletes the reader's rating and review of a book.", intentType: BookIntent.DeleteReview, requirements: [{ contextCategory: ContextCategory.Reviews }] },
  { id: 'add-note', name: 'Add Note', description: 'Saves a note about a book.', intentType: BookIntent.AddNote, requirements: library },
  { id: 'search-library', name: 'Search Library', description: "Finds books in the reader's library by title, author, genre, series or shelf.", intentType: BookIntent.SearchLibrary, requirements: library },
  { id: 'library-question', name: 'Library Question', description: "Answers questions about the reader's own library and records.", intentType: BookIntent.LibraryQuestion, requirements: library },
  { id: 'recommend-books', name: 'Recommend Books', description: "Suggests what to read next from the reader's Want to Read list and taste.", intentType: BookIntent.RecommendBook, requirements: library },
  { id: 'create-shelf', name: 'Create Shelf', description: 'Creates a new shelf.', intentType: BookIntent.CreateShelf, requirements: [{ contextCategory: ContextCategory.Collections }] },
  {
    id: 'organize-shelf',
    name: 'Organize Shelf',
    description: 'Puts books on a shelf or takes them off (they stay in the library).',
    intentType: BookIntent.OrganizeShelf,
    requirements: [{ contextCategory: ContextCategory.Collections }, ...library],
  },
];

export function registerCapabilities() {
  for (const capability of CAPABILITIES) {
    if (!capabilityRegistry.exists(capability.id)) capabilityRegistry.register(capability);
  }
  return capabilityRegistry;
}
