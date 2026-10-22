// The in-app data-processing disclosure (SRS §38.5, T-077). Keep in step
// with docs/AI_DATA_POLICY.md — a material change there bumps the API's
// AI_POLICY_VERSION, which asks users to re-confirm.

export const SEMANTIC_SEARCH_DISCLOSURE =
  'Bunko turns your highlights, quotes, notes, and reviews into search vectors on Bunko’s own servers, so you can ' +
  'search them by meaning. Nothing is sent to an outside company. Turning this off deletes those vectors.';

export const GENERATIVE_DISCLOSURE =
  'Powers the Assistant chat and book summaries. When you send the Assistant a message, Bunko sends it, the last few ' +
  'messages, and a summary of your library (titles, reading status, shelves) to NVIDIA’s AI service; a book summary ' +
  'sends that book’s highlights, notes, and review to Anthropic’s Claude API. Data is sent only when you ask, and ' +
  'Bunko doesn’t store the replies. Needs semantic search to be on.';

export const TRANSLATION_DISCLOSURE =
  'When you ask to translate a chapter of a book in your library, Bunko sends that chapter’s text to Anthropic’s ' +
  'Claude API, which translates it. Text is sent only when you ask, one chapter at a time. The translation is saved ' +
  'for you alone and never shown to other readers. Turning this off deletes your saved translations.';
