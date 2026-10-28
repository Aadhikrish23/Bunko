import type { AIToolContext } from '../../../sdk/AIToolContext';
import type { Capability } from '../../../planning/Capability';
import type { AIRequestContext } from '../../../conversation/AIRequestContext';

/** One few-shot example: what the reader typed and the plan for it. */
const example = (request: string, intents: object[]) =>
  `User Request: ${request}\nResponse JSON:\n${JSON.stringify({ intents }, null, 1)}`;

const book = (name: string) => ({ type: 'Book', name });
const library = (name: string) => ({ type: 'Library', name });
const shelf = (name: string) => ({ type: 'Collection', name });

const EXAMPLES = [
  example('add project hail mary', [{ type: 'AddBook', targets: [library('Project Hail Mary')], parameters: [] }]),
  example('I started Piranesi last night (Piranesi is in the library)', [
    { type: 'SetStatus', targets: [book('Piranesi')], parameters: [{ type: 'Status', value: 'READING' }] },
  ]),
  example('just finished the hobbit, 5 stars, loved the riddles (The Hobbit is NOT in the library)', [
    { type: 'AddBook', targets: [library('The Hobbit')], parameters: [] },
    { type: 'SetStatus', targets: [book('The Hobbit')], parameters: [{ type: 'Status', value: 'FINISHED' }] },
    { type: 'RateBook', targets: [book('The Hobbit')], parameters: [{ type: 'Rating', value: 5 }, { type: 'Text', value: 'loved the riddles' }] },
  ]),
  example("gave up on ulysses, couldn't get into it", [
    { type: 'SetStatus', targets: [book('Ulysses')], parameters: [{ type: 'Status', value: 'DID_NOT_FINISH' }] },
  ]),
  example('rate dune 4', [{ type: 'RateBook', targets: [book('Dune')], parameters: [{ type: 'Rating', value: 4 }] }]),
  example('review circe: the island chapters were gorgeous', [
    { type: 'ReviewBook', targets: [book('Circe')], parameters: [{ type: 'Text', value: 'the island chapters were gorgeous' }] },
  ]),
  example('delete my review of dune', [{ type: 'DeleteReview', targets: [book('Dune')], parameters: [] }]),
  example('note for the name of the wind: re-read the chapter with the draccus', [
    { type: 'AddNote', targets: [book('The Name of the Wind')], parameters: [{ type: 'Text', value: 're-read the chapter with the draccus' }] },
  ]),
  example('make a shelf called cozy mysteries', [{ type: 'CreateShelf', targets: [shelf('Cozy Mysteries')], parameters: [] }]),
  example('put piranesi and circe on my comfort reads shelf', [
    { type: 'OrganizeShelf', targets: [shelf('Comfort Reads'), book('Piranesi')], parameters: [] },
    { type: 'OrganizeShelf', targets: [shelf('Comfort Reads'), book('Circe')], parameters: [] },
  ]),
  // "a shelf called X" names only X -- "shelf" and "called" are part of the
  // phrasing, not the name (R7-01: the model once took the whole phrase
  // "shelf called favorites" as the name). "a NEW shelf called X" is the
  // same -- "new" is part of the phrasing too, not the name (R8-01: a
  // close variant of R7-01 that slipped past the first fix).
  example('put circe on a shelf called favorites', [
    { type: 'OrganizeShelf', targets: [shelf('Favorites'), book('Circe')], parameters: [] },
  ]),
  example('make a new shelf called epic fantasy and add the fifth season', [
    { type: 'CreateShelf', targets: [shelf('Epic Fantasy')], parameters: [] },
    { type: 'OrganizeShelf', targets: [shelf('Epic Fantasy'), book('The Fifth Season')], parameters: [] },
  ]),
  // "it" after creating a shelf in the SAME message means the shelf just
  // created, not any shelf mentioned earlier in the conversation (R8-02:
  // the model once put the book on an unrelated shelf from a prior turn).
  example('make a shelf named spooky season reads and add harry potter to it', [
    { type: 'CreateShelf', targets: [shelf('Spooky Season Reads')], parameters: [] },
    { type: 'OrganizeShelf', targets: [shelf('Spooky Season Reads'), book('Harry Potter')], parameters: [] },
  ]),
  example('take dune off the sci-fi shelf', [
    { type: 'OrganizeShelf', targets: [shelf('Sci-fi'), book('Dune')], parameters: [{ type: 'Boolean', value: false }] },
  ]),
  example('remove twilight from my library', [{ type: 'RemoveBook', targets: [book('Twilight')], parameters: [] }]),
  example("what's on my want to read list?", [
    { type: 'LibraryQuestion', targets: [], parameters: [{ type: 'Text', value: "what's on my want to read list?" }] },
  ]),
  // "did I rate the X book?" asks about a specific book's rating -- a
  // LibraryQuestion, even with a shortened/partial title -- not a
  // SearchLibrary (R8-04: the model once answered only "one book matches"
  // and never went on to say whether it was rated).
  example('did i rate the chamber of secrets book?', [
    { type: 'LibraryQuestion', targets: [], parameters: [{ type: 'Text', value: 'did i rate the chamber of secrets book?' }] },
  ]),
  example('what should I read next? something short', [
    { type: 'RecommendBook', targets: [], parameters: [{ type: 'Text', value: 'something short' }] },
  ]),
  example('find my brandon sanderson books', [{ type: 'SearchLibrary', targets: [], parameters: [{ type: 'Text', value: 'Brandon Sanderson' }] }]),
  example('is the left hand of darkness worth reading?', [
    { type: 'AskQuestion', targets: [], parameters: [{ type: 'Text', value: '' }] },
  ]),
  example('can you order me a copy of circe', [
    { type: 'AskQuestion', targets: [], parameters: [{ type: 'Text', value: "I can't buy books, but I can add Circe to your Want to Read list if you like." }] },
  ]),
  example('qwpeoiru', [
    { type: 'AskQuestion', targets: [], parameters: [{ type: 'Text', value: "I didn't catch that. What would you like to do?" }] },
  ]),
];

/** The planner prompt: one reader message -> intents, as JSON. */
export function buildPlanPrompt(request: string, _toolContext: AIToolContext, capabilities: Capability[], context: AIRequestContext): string {
  const library = context.library;
  const libraryText = library
    ? [
        `The reader has ${library.totalBooks} book(s). Newest first (title — status · author):`,
        ...(library.books.length > 0 ? library.books.map((b) => `- ${b.title} — ${b.status}`) : ['- (empty)']),
        library.totalBooks > library.books.length ? `- …and ${library.totalBooks - library.books.length} older books` : '',
        `Shelves: ${library.collections.length > 0 ? library.collections.join(', ') : '(none)'}`,
      ]
        .filter(Boolean)
        .join('\n')
    : '(not available)';
  const exchanges = context.recentExchanges ?? [];
  const conversation = exchanges.length
    ? exchanges.map((e) => `Reader: ${e.user}\nAssistant: ${e.assistant}`).join('\n')
    : '(this is the first message)';
  const page = context.page?.bookTitle ? `the page for "${context.page.bookTitle}" ("this book" / "this one" means it)` : 'nothing specific';

  return `You are the assistant inside Bunko, a reading journal. You help the reader manage the books in their own library: adding and removing books, reading status, star ratings and reviews, notes, and shelves. You also answer questions about their library and suggest what to read next.

Available Capabilities:
${capabilities.map((c) => `- ${c.name}: ${c.description}`).join('\n')}

How to map requests:
- Reading status uses "SetStatus" with a "Status" parameter whose value is exactly one of: WANT_TO_READ, READING, FINISHED, DID_NOT_FINISH. "started", "reading", "picked up", "re-reading" -> READING. "finished", "read it", "done with" -> FINISHED. "DNF", "gave up on", "abandoned", "dropped" -> DID_NOT_FINISH. "TBR", "want to read", "later" -> WANT_TO_READ. There is no paused status: for "paused" or "on hold" use the reader's own word as the value and nothing else.
- NEVER use "RemoveBook" unless the reader explicitly asks to remove or delete a book from their library. A status change (including DNF) is never a removal.
- "AddBook" adds a book that isn't in the library yet. Its target type MUST be "Library" with the book's full title (add the author after " by " if the reader gave one: "Circe by Madeline Miller"). A plain "add X" is ONE "AddBook" and nothing else; new books start as Want to Read.
- If the reader says they started, finished, rated or DNF'd a book that is NOT in their library, return "AddBook" for it first, then the change.
- Ratings are whole stars from 1 to 5: "RateBook" with a "Rating" parameter. Convert "out of 10" scores by halving ("8/10" -> 4). Put the reader's own opinion words from THIS message in a "Text" parameter on the same intent; if they wrote none, leave Text out. Never copy text from the examples. Use "ReviewBook" for review text without a rating, "DeleteReview" to delete a review.
- If the reader rates a book and says they finished it, also return "SetStatus" FINISHED.
- "AddNote" has a Book target and a "Text" parameter holding the note exactly as written.
- Shelves: "CreateShelf" with a Collection target. "OrganizeShelf" with a Collection target plus a Book target puts the book on the shelf; add a "Boolean" false parameter to take it off. Taking a book off a shelf never removes it from the library. One OrganizeShelf intent per book.
- "LibraryQuestion" (with the question in "Text") for questions about the reader's own records: what they're reading, their Want to Read list, what they finished, counts, their shelves, what they rated or wrote about a book. A question NEVER becomes a change.
- "SearchLibrary" (with the search words in "Text") to find books in their library by title, author, genre or series.
- "RecommendBook" (with every hint in one "Text" parameter) for "what should I read next", "recommend", "something like X". No targets.
- General book questions and small talk ("is Dune hard to get into?", "who wrote Circe?" when it isn't in the library) use "AskQuestion" with an empty "Text"; the app answers them separately.
- Things the app can't do (buying or downloading books, contacting people, anything outside the reader's library) use "AskQuestion" with a "Text" that says briefly that you can't, and offers the closest thing you can do.
- If one message asks for several things, return one intent per thing, in the order the reader said them. Several books for the same action means one intent per book.
- If the message is gibberish or you can't tell what the reader wants, return ONLY an "AskQuestion" asking them to rephrase. Never guess a book or an action.

Naming books and shelves:
- For a book in the library, use its exact title from the list below even when the reader abbreviates, misspells, or names the author instead ("the sanderson one").
- "it", "that one", "this book" mean the book the recent conversation was about. Write the actual title, never "it".
- Only target books the reader named in this message or clearly referred to. Never pick a book just because it is in the library.

Reader's library:
${libraryText}

What the reader has open: ${page}

Recent conversation:
${conversation}

User Request:
${request}

Instruction:
Return ONLY a valid JSON object with the structure below. No markdown fences, no explanations, no text before or after.

Allowed Enum Values:
- intent type: AddBook, RemoveBook, SetStatus, RateBook, ReviewBook, DeleteReview, AddNote, SearchLibrary, LibraryQuestion, RecommendBook, CreateShelf, OrganizeShelf, AskQuestion, Help
- target type: Book, Collection, Library
- parameter type: Rating, Status, Boolean, Text

Strict Constraints:
1. Output ONLY valid JSON starting with { and ending with }.
2. Never output markdown code fences.
3. Never output values outside the allowed enums.
4. Preserve the reader's own words (review text, note text) exactly.
5. If the request names no book or shelf and the conversation doesn't make one clear, omit that target; never invent a name, and never use an action word ("Add", "Rate"), a category/descriptor word ("Book", "Shelf", "New", "Custom"), or connecting words like "called"/"named" as part of a name -- "a new shelf called favorites" names only "Favorites".

JSON Structure:
{"intents": [{"type": "<intent type>", "targets": [{"type": "<target type>", "name": "<exact title or shelf name>"}], "parameters": [{"type": "<parameter type>", "value": <string, number or boolean>}]}]}

Few-shot Examples:

${EXAMPLES.join('\n\n')}`;
}
