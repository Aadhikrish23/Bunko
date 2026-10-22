// The in-app data-processing disclosure (SRS §38.5, T-077). Keep in step
// with docs/AI_DATA_POLICY.md — a material change there bumps the API's
// AI_POLICY_VERSION, which asks users to re-confirm.

export const SEMANTIC_SEARCH_DISCLOSURE =
  'Bunko turns your highlights, quotes, notes, and reviews into search vectors on Bunko’s own servers, so you can ' +
  'search them by meaning. Nothing is sent to an outside company. Turning this off deletes those vectors.';

export const GENERATIVE_DISCLOSURE =
  'When you ask a question or request a summary, insights, or recommendations, Bunko sends the excerpts of your own ' +
  'highlights, notes, reviews, ratings, and library that the request needs to Anthropic’s Claude API, which writes ' +
  'the response. Data is sent only when you ask, and Bunko doesn’t keep the responses. Anthropic processes it under ' +
  'its commercial API terms. Needs semantic search to be on.';
