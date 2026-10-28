# Bunko — AI Data Processing

Policy version: **2026-10-28.1** (book summaries and chapter translation move from Anthropic's Claude API to NVIDIA NIM) (must match `AI_POLICY_VERSION` in
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
| What it processes | Only what the request needs: for a book summary, that book's highlights, notes, review, and session reflections; for the **assistant chat** (Phase 12, SRS §20.6), the reader's message, the last few messages of the conversation, and a summary of their library (book titles, reading status, shelf names), plus — for a question about a specific book — what the reader recorded about it (rating, review, notes) |
| Where | Book summaries and the assistant chat both run on **NVIDIA NIM** (`integrate.api.nvidia.com`), under NVIDIA's API terms (the operator can switch either provider in configuration; this document is updated when they do). Sent only when the reader asks or sends a message. Account details (email, name, password) are never sent. |
| What is stored by Bunko | Book summaries: nothing. The chat keeps the last six exchanges in server memory (not the database) so "it" and "undo" work; they are gone on "Clear" or a server restart. |
| Limits | A per-user daily cap on model calls (`AI_DAILY_GENERATION_LIMIT`, default 30); chat messages answered from the reader's data without the model don't count |
| On revoke | No further requests are sent |

## 3. Chapter translation (Phase 11, SRS §20.5)

Independent of the two features above.

| | |
|---|---|
| What it processes | The text of the one chapter the reader asks to translate, from a digital book in their own library, and the language they chose |
| Where | Sent to **NVIDIA NIM** in pieces of about 6,000 characters, when and only when the reader asks, under NVIDIA's API terms. Account details are never sent. |
| What is stored by Bunko | The translated chapter, in the `ChapterTranslation` table, visible only to that reader. It is never shown to other readers of the same edition. |
| Limits | One chapter per request, at most 120,000 characters; a per-user daily allowance (`AI_DAILY_TRANSLATION_CHARS`, default 200,000 characters) |
| On revoke | All of the reader's saved translations are deleted at once, and a translation still in progress stops before sending any more text |

## 4. Cover photo processing and AI-generated spine art (Phase 13, T-109)

Independent of the features above; does not require any AI consent toggle
(an on-request, per-book action with no private reading content involved —
see the SRS Change Log's 2026-10-28 entry).

| | |
|---|---|
| What it processes | For a cover/spine photo upload: the uploaded image only (cropped/upscaled by Bunko's own backend, no third party involved). For spine art generation: the book's title, author(s), and language — sent only when no cover or spine image exists yet for that book. |
| Where | Cropping/upscaling happens entirely in the Express API. Spine art generation is sent to **NVIDIA NIM** (`integrate.api.nvidia.com`), under NVIDIA's API terms. Account details are never sent. |
| What is stored by Bunko | The processed cover photo and/or generated spine image, in Bunko's own object storage; `Work.coverImageSource` records whether it came from metadata, an upload, or generation, so a background metadata refresh never overwrites a reader's own upload or a generated image. |
| On revoke | Not applicable — this isn't gated by an AI consent toggle; a reader can replace or clear a cover/spine photo at any time from the book's detail page. |

## Safeguards

- `ai-service` is internal-only: reachable only from the Express API with a
  shared token, never from browsers (`ARCHITECTURE.md` §8).
- It connects with its own database role that can read only the content
  these features need and write only to `AiEmbedding`
  (`ai-service/scripts/create_ai_role.sql`).
- The reader's text, and the book text sent for translation, are passed to
  the model as data, never as instructions, and are escaped so they can't
  break out of that framing.
- Without an NVIDIA API key configured, generated insights and
  translation are simply unavailable; search by meaning keeps working.
