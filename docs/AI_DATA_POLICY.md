# Bunko — AI Data Processing

Policy version: **2026-10-22.2** (adds §3, chapter translation) (must match `AI_POLICY_VERSION` in
`backend/src/modules/ai/ai.service.ts`; the in-app wording lives in
`frontend/src/features/ai/ai-disclosure.ts`). Change all three together.

This is the disclosure SRS §20.4 and §38.5 require for Phase 10. It
describes what Bunko does, so the in-app text and the code can be
checked against it.

## Principles

- **Off by default.** Nothing below happens until the reader turns it on
  in Settings, and each of the three features is a separate choice.
- **The reader's own data only.** No feature reads another user's data,
  and nothing is based on anyone else's reading.
- **Labelled.** Every generated output is shown as an AI interpretation,
  not a fact (SRS §20.3).
- **Revocable.** Turning a feature off stops it immediately; turning
  semantic search off also deletes its stored data.

## 1. Search by meaning (semantic search)

| | |
|---|---|
| What it processes | The text of the reader's highlights and quotes (with their margin notes), standalone notes, and review text |
| Where | Bunko's own `ai-service`, using a local embedding model. **No third party receives this data.** |
| What is stored | One vector plus the excerpt per item, in the `AiEmbedding` table, kept current as the reader edits |
| On revoke | All of the reader's embeddings are deleted at once, by the API directly (not dependent on `ai-service` being up) |

## 2. Generated insights

Requires search by meaning (answers are grounded in retrieved excerpts).

| | |
|---|---|
| What it processes | Only what the request needs: for a question, the top matching excerpts; for a book summary, that book's highlights, notes, review, and session reflections; for insights and recommendations, the reader's library (titles, authors, genres, status, ratings, review snippets), reading totals, and a sample of recent notes |
| Where | Sent to **Anthropic's Claude API** when — and only when — the reader asks, and processed under Anthropic's commercial API terms. Account details (email, name, password) are never sent. |
| What is stored by Bunko | Nothing. The response is returned to the reader and not kept. |
| Limits | A per-user daily cap (`AI_DAILY_GENERATION_LIMIT`, default 30) |
| On revoke | No further requests are sent |

## 3. Chapter translation (Phase 11, SRS §20.5)

Independent of the two features above.

| | |
|---|---|
| What it processes | The text of the one chapter the reader asks to translate, from a digital book in their own library, and the language they chose |
| Where | Sent to **Anthropic's Claude API** in pieces of about 6,000 characters, when and only when the reader asks, under Anthropic's commercial API terms. Account details are never sent. |
| What is stored by Bunko | The translated chapter, in the `ChapterTranslation` table, visible only to that reader. It is never shown to other readers of the same edition. |
| Limits | One chapter per request, at most 120,000 characters; a per-user daily allowance (`AI_DAILY_TRANSLATION_CHARS`, default 200,000 characters) |
| On revoke | All of the reader's saved translations are deleted at once, and a translation still in progress stops before sending any more text |

## Safeguards

- `ai-service` is internal-only: reachable only from the Express API with a
  shared token, never from browsers (`ARCHITECTURE.md` §8).
- It connects with its own database role that can read only the content
  these features need and write only to `AiEmbedding`
  (`ai-service/scripts/create_ai_role.sql`).
- The reader's text, and the book text sent for translation, are passed to
  the model as data, never as instructions, and are escaped so they can't
  break out of that framing.
- Without an Anthropic API key configured, generated insights and
  translation are simply unavailable; search by meaning keeps working.
