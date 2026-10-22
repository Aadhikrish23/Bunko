# Bunko — MVP Task Backlog

Tickets for Phases 1-7 (`SRS.md` §36.1; Phases 6-7 are the
fast-follow v1.1 phases per `IMPLEMENTATION_PLAN.md` §5-6). Work top-to-bottom
within a phase; do not start a later phase until the current one's
tickets are merged, unless a ticket's "Depends on" field says
otherwise. See `AGENTS.md` for how to pick up a ticket.

Format: **ID — Title** · Depends on · SRS refs, then description and
acceptance criteria.

---

## Phase 1 — Foundation

### T-001 — Repo scaffolding and tooling
Depends on: none · SRS: —

Initialise `backend/` (Express + TypeScript) and `frontend/` (Vite +
React) apps with strict TypeScript, ESLint, Prettier configured per
`CODING_STANDARDS.md`. Install Zod for validation.

- [x] `npm run lint`, `typecheck`, `test` scripts exist in both apps
- [x] Strict TS config in both apps
- [x] `backend/src/app.ts` assembles Express with a placeholder health
      check route (`GET /health`) — proves the base server runs
- [x] `.gitignore` covers `node_modules`, `.env`, build output

### T-001a — Playwright test harness
Depends on: T-001 · SRS: —

Set up `backend/tests/playwright.config.ts` and
`frontend/e2e/playwright.config.ts` per `docs/TESTING_STRATEGY.md` §2.

- [x] `npm run test` (backend) runs Playwright API tests against
      `GET /health` successfully as a smoke test
- [x] `npm run test:e2e` (frontend) runs a trivial Playwright browser
      test successfully as a smoke test
- [x] Both configs support headless CI execution

### T-001b — Swagger UI setup
Depends on: T-001 · SRS: §28

Wire `swagger-ui-express` to serve `docs/openapi.yaml` at
`GET /api/docs`, per `ARCHITECTURE.md` §7.

- [x] `/api/docs` renders the interactive Swagger UI from the YAML
      file directly (no build/codegen step)
- [x] `/api/openapi.yaml` serves the raw file for tooling

### T-002 — Local dev environment (Docker Compose)
Depends on: T-001 · SRS: §34

Docker Compose brings up Postgres 16, Redis, and MinIO with sane
defaults matching `.env.example`.

- [x] `docker compose up -d` starts all three services healthy
- [x] MinIO console reachable locally; bucket auto-created on startup

### T-003 — Database connection and Prisma setup
Depends on: T-002 · SRS: §27

Wire Prisma to Postgres; commit the initial schema from
`docs/DATA_MODEL.md` §2 as the first migration.

- [x] `npm run prisma:migrate` applies cleanly on a fresh DB
- [x] Schema matches `docs/DATA_MODEL.md` exactly

### T-004 — CI pipeline
Depends on: T-001 · SRS: —

GitHub Actions workflow running lint, typecheck, unit tests on every
PR (per `docs/TESTING_STRATEGY.md` §5, integration/e2e steps stubbed
until T-003 lands).

- [x] PR blocked from merging if any step fails
- [x] Runs on both `backend/` and `frontend/` independently (path filters)

### T-005 — Response envelope and global error handling
Depends on: T-003 · SRS: §30

Implement the success/error envelope from `API_SPEC.md` §3: a small
response-shaping helper used by every controller for success, and a
single global `errorHandler` middleware (registered last in `app.ts`,
per `CODING_STANDARDS.md` §5) for errors.

- [x] Every response (success or error) matches the envelope shape
- [x] Error codes match `API_SPEC.md` §4; no stack traces leak to client
- [x] `AppError` class exists (`code`, `message`, `statusCode`) for
      controllers/services to throw

### T-006 — User registration
Depends on: T-005 · SRS: §23, FR-001

`POST /auth/register` per `openapi.yaml`.

- [x] Password hashed with Argon2id, never returned in response
- [x] Duplicate email returns 409 `CONFLICT`
- [x] Unit + integration tests per `TESTING_STRATEGY.md`

### T-007 — Login and JWT issuance
Depends on: T-006 · SRS: §23, FR-002

`POST /auth/login` issuing short-lived access token + httpOnly refresh
cookie.

- [x] Wrong password returns 401, does not reveal whether email exists
- [x] Access token expires in 15 min (configurable)

### T-008 — Refresh token rotation
Depends on: T-007 · SRS: §23

`POST /auth/refresh`; each use invalidates the prior refresh token.

- [x] Reusing an already-rotated refresh token is rejected and logged
- [x] New access token issued on success

### T-009 — Auth middleware
Depends on: T-007 · SRS: §25

`authMiddleware` (`middleware/auth.ts`) that verifies the JWT and sets
`req.user`, applied explicitly on every route that needs it (see
`CODING_STANDARDS.md` §6 — there is no global framework guard).

- [x] Missing/invalid/expired token returns 401 `UNAUTHENTICATED`
- [x] `req.user.id` never derived from a client-supplied field

### T-010 — User profile endpoint
Depends on: T-009 · SRS: §23

Get/update the authenticated user's own profile.

- [x] Cannot fetch or modify another user's profile by ID

### T-011 — Observability baseline
Depends on: T-005 · SRS: §32

Structured JSON logging with a `requestId` correlated across a
request's lifecycle.

- [x] Every log line includes `requestId`, `userId` (if authenticated)
- [x] Errors logged with enough context to debug without reproducing

---

## Phase 2 — Book Management

### T-012 — Work/Author/Series schema and migration
Depends on: T-003 · SRS: §16, §27

- [x] Migration matches `DATA_MODEL.md`; `WorkAuthor` join table present

### T-013 — Work CRUD endpoints
Depends on: T-012, T-009 · SRS: §15, §16, FR-003

`POST/GET/PATCH/DELETE /works` per `openapi.yaml`.

- [x] All endpoints scoped to caller's `UserWork` rows
- [x] 404 (not 403) when accessing another user's work
- [x] `POST` with a matching `externalSource`+`externalId` reuses the
      existing `Work` row instead of creating a duplicate
      (`DATA_MODEL.md` §4)

### T-013a — External book metadata search (Open Library)
Depends on: T-012 · SRS: §16, `ARCHITECTURE.md` §11

`GET /metadata/search` proxying Open Library per `openapi.yaml`, so
adding a book can start from a search-and-pick flow instead of fully
manual entry.

- [x] Response shape matches `MetadataCandidate` regardless of
      provider (provider-agnostic, per `ARCHITECTURE.md` §11)
- [x] Open Library queried only on explicit user search, never
      re-queried automatically after a `Work` is created
- [x] Handles Open Library rate-limit/error responses gracefully
      (returns an empty list with a retryable error code, not a 500)
- [x] No API key/secret required or referenced anywhere in this ticket

### T-014 — Edition endpoints
Depends on: T-013 · SRS: §16

`POST /editions`; edition nested in `GET /works/:id` response.

- [x] `format` enum enforced (`PHYSICAL`/`EPUB`/`PDF`)

### T-015 — Copy endpoints
Depends on: T-014 · SRS: §16

`POST /copies` linking a user to an edition (+ optional digital file).

- [x] A copy cannot reference a `digitalFileId` already attached to a
      different copy

### T-016 — Shelf CRUD and assignment
Depends on: T-013 · SRS: §15

- [x] Shelf name unique per user
- [x] Assigning/removing a work from a shelf doesn't affect other shelves

### T-017 — Library search and filter
Depends on: T-013 · SRS: §18

`GET /works` with `q`, `status`, `shelfId` params per `openapi.yaml`.

- [x] Search matches title and author name (case-insensitive)
- [x] Combining filters (status + shelf) narrows correctly

---

## Phase 3 — Reading Tracking

### T-018 — ReadingJourney and ReadingPosition schema
Depends on: T-012 · SRS: §27, §11.2

- [x] One `ReadingJourney` per `(userId, workId)` pair (unique constraint)

### T-019 — Reading session state machine (backend)
Depends on: T-018, T-015 · SRS: §12.7

Implement `ACTIVE → PAUSED → ACTIVE → ENDED` transitions as described
in `SRS.md` §12.7.

- [x] Starting a session while one is `ACTIVE` for the user returns 409
- [x] State transitions match the diagram in SRS §12.7 exactly
- [x] Encodes the worked idle-timeout example from SRS §12.8 as a test

### T-020 — Idle-timeout auto-pause job
Depends on: T-019 · SRS: §12.8 steps 4-5

Background job (BullMQ) that pauses sessions idle beyond the
configured threshold, and ends sessions paused beyond the grace window.

- [x] Thresholds configurable via env vars, defaults match SRS (5
      min idle → pause, 15 min grace → end)
- [x] Test uses a mocked clock, not real sleeps

### T-021 — Session end + reflection
Depends on: T-019 · SRS: §12.9 steps 4-6, §12.10

`POST /reading-sessions/:id/end` — idempotent, accepts optional
`reflection`.

- [x] Calling `end` twice with the same payload does not error
- [x] Physical sessions require `endPosition` before ending (§12.9 step 4)

### T-022 — Journal endpoint
Depends on: T-021 · SRS: §12.5

`GET /journal`, paginated, optionally filtered by `workId`.

- [x] Ordered reverse-chronological by `startTime`
- [x] Same-day/same-book sessions remain separate records (§12.11)

### T-023 — Basic reading statistics
Depends on: T-021 · SRS: §19 (baseline only — full stats dashboard is Phase 7)

Minimum: total books read, total minutes read, current streak.

- [x] Numbers reconcile against a fixture set of known sessions

---

## Phase 4 — Digital Reading

### T-024 — File upload-url and confirm endpoints
Depends on: T-002, T-009 · SRS: §24, §38.2, §38.3

Two-step upload per `API_SPEC.md` §7.

- [x] Declared MIME type verified against actual file content on confirm
- [x] Upload rejected if it would exceed the user's quota (`DATA_MODEL.md` §5)
- [x] Signed URLs are time-limited

### T-025 — EPUB import and structural indexing
Depends on: T-024 · SRS: §11.6, §38.3

Implements the import-time indexing pipeline (SRS §11.6 steps 1-4) for
EPUB: parse spine/TOC, build `chapterGraph`, generate text anchors.

- [x] Malformed/malicious EPUB (script injection attempt) is neutralised,
      not executed, and does not crash the pipeline
- [x] `chapterGraph` stored on `Edition` matches the schema in `DATA_MODEL.md`

### T-026 — PDF import and page-fallback indexing
Depends on: T-024 · SRS: §11.6 step 5, §38.2

Handles the PDF variability risk (scanned pages, missing text layer)
with graceful degradation.

- [x] A scanned PDF with no text layer still imports, with mapping
      capability limited to page-fallback only (documented in response)

### T-027 — Reader manifest endpoint
Depends on: T-025, T-026, T-019 · SRS: §10, §11

`GET /editions/:id/reader-manifest` — signed file URL + resolved start
position + auto-started session, per `openapi.yaml`.

- [x] Auto-starts a `ReadingSession` per SRS §12.8 step 2

### T-028 — Frontend: EPUB reader (epub.js)
Depends on: T-027 · SRS: §10

- [x] Renders EPUB content, supports location-based navigation
- [x] Reports position updates on a debounced interval, not every scroll event

### T-029 — Frontend: PDF reader (pdf.js)
Depends on: T-027 · SRS: §10

- [x] Renders PDF content with page navigation
- [x] Handles the page-fallback-only case from T-026 gracefully in the UI

### T-030 — Automatic progress reporting
Depends on: T-028, T-029 · SRS: §12.8 step 3

`PATCH /reading-sessions/:id/progress` wired from both readers.

- [x] Debounced (not on every event) to avoid request flooding

### T-031 — Bookmarks (basic)
Depends on: T-028, T-029 · SRS: §10

Minimal manual bookmark within a digital edition (separate from
canonical position).

- [x] User can set/jump to a bookmark within their own copy only

---

## Phase 5 — Unified Physical/Digital Reading

### T-032 — Canonical mapping: structural ID and title match
Depends on: T-025, T-018 · SRS: §11.7 steps 1-2

- [x] Encodes the worked example from `SRS.md` §11.9 as a literal test case
- [x] Structural ID match always wins over title match when both are available

### T-033 — Text-anchor fingerprint matching
Depends on: T-032 · SRS: §11.6 step 4, §11.7 step 3

- [x] Fingerprint search returns a confidence proportional to match
      strength, per §11.8 ordering (never overrides a stronger structural signal)

### T-034 — Proportional/page fallback and confidence threshold
Depends on: T-033 · SRS: §11.7 steps 4-5, §11.8

- [x] Below-threshold confidence sets `requiresConfirmation: true` and
      does not auto-navigate

### T-035 — Resolve-position endpoint
Depends on: T-034 · SRS: §11

`POST /reading-journeys/:id/resolve-position` per `openapi.yaml`.

### T-036 — Frontend: low-confidence confirmation prompt
Depends on: T-035 · SRS: §11.4

- [x] Shows "We found a likely match near Chapter X. Continue here?"
      exactly when `requiresConfirmation` is true, per SRS §11.4

### T-037 — Manual position correction
Depends on: T-035 · SRS: §11.5

Endpoint + UI for the user to correct a mapped location; correction
stored to improve future mapping for that user's edition pair.

- [x] Correction is scoped to the user (does not affect other users'
      mappings)

### T-037a — OCR backfill for scanned PDFs
Depends on: T-026 · SRS: §11.6 step 1, §38.2

Pulled into Phase 5 as a requirement change (see SRS.md's Requirement
Change Policy → Change Log, 2026-09) — was previously deliberately out
of scope (T-026 chose graceful degradation instead). For a PDF with
`hasTextLayer: false` (`pdf-indexer.ts`), run OCR to produce a text
layer before the existing indexing pipeline (chapter graph, text
anchors) runs over it, rather than leaving every unit's `text` empty.

- [x] A scanned PDF with a bookmark outline gets real per-chapter OCR
      text (not just page-fallback navigation)
- [x] A scanned PDF with no outline gets real per-page OCR text
- [x] OCR runs as a background job (BullMQ), not inline in the
      request/response cycle — a large scanned book must not block
      opening the reader or time out the HTTP request
- [x] The scanned page image remains what the reader displays; OCR
      text is index-only (search/chapters/continuity anchors), per the
      chapter-extraction plan's scope decision — this ticket does not
      change T-026/T-029's rendering behavior
- [x] OCR failure/low-confidence output degrades gracefully back to
      T-026's existing page-fallback-only behavior, not a hard error
- [x] No OCR is attempted for a PDF that already has a text layer
      (`hasTextLayer: true` short-circuits before this ticket's code
      path, matching the existing check)

---

## Cross-Cutting Frontend Tickets (interleave with backend phases above)

### T-038 — Library UI (browse/add/search)
Depends on: T-013, T-017 · SRS: §15, §18, §29

- [x] Widescreen/4K responsive layout, 3D spine views, candidate preview info screen, multi-language filter dropdown

### T-039 — Physical session UX flow
Depends on: T-021 · SRS: §12.9

Implements the manual start/end flow described step-by-step in SRS
§12.9, including the chapter/position picker and forgotten-session
reminder (step 6).

- [x] Interactive start/pause/end physical session UI panel and position inputs

### T-040 — Digital session auto-start/pause integration
Depends on: T-027, T-020 · SRS: §12.8

Frontend reflects session state (Active/Paused/Ended) surfaced by the
backend without the user manually managing it, per §12.8.

- [x] Reader manifest auto-starts session, handles active session conflicts cleanly

### T-041 — Reflection prompt UI
Depends on: T-021 · SRS: §12.10

Non-blocking optional reflection field on session-end, matching the
flow diagram in SRS §12.10 exactly (skip must be one tap).

- [x] Non-blocking optional reflection modal with single-tap skip/submit

---

## Phase 6 — Annotations (Fast-Follow v1.1)

Scoped per `IMPLEMENTATION_PLAN.md` §5. The MVP reader already ships a
localStorage-only highlight/quote UI (`lib/annotations.ts`,
`AnnotationsDrawer.tsx`) as a stopgap — this phase gives it a real,
cross-device backend (same class of fix as the Shelves drag-order
bug) and adds the standalone-note and search capabilities SRS §13
describes that the stopgap never built. Depends on Phase 4 (reader)
and Phase 5 (location/structural-ID anchoring), both already shipped.

### T-042 — Annotation & Note data model
Depends on: T-011, T-032 · SRS: §13, §27

Adds the Highlight/Quote storage (one `Annotation` table with a `kind`
discriminator — the two share nearly every field per §13.2/§13.3) and
a separate `Note` table for standalone notes not anchored to a text
selection (book/chapter/section/page/passage/session-level per
§13.1). Both were deferred from `DATA_MODEL.md` §5 until now.
`position` follows the same "opaque string, format depends on medium"
convention already established by `ReadingSession.startPosition`.

- [x] `Annotation` model: kind (HIGHLIGHT\|QUOTE), copyId, sessionId?, position, text, color?, note?, tags[]
- [x] `Note` model: workId, copyId?, sessionId?, scope enum (BOOK\|CHAPTER\|SECTION\|PAGE\|PASSAGE\|SESSION), position?, body
- [x] Prisma migration generated and applied
- [x] `DATA_MODEL.md` updated (models moved out of §5's deferred list)

### T-043 — Annotation CRUD API (highlights & quotes)
Depends on: T-042 · SRS: §13.2, §13.3, §13.4

- [x] `POST /editions/:editionId/annotations` — resolves the copy from editionId+userId, same ownership pattern as `reader.service.ts`
- [x] `GET /editions/:editionId/annotations`
- [x] `PATCH /annotations/:id` (note/tags/color)
- [x] `DELETE /annotations/:id`
- [x] Ownership checked server-side on every route
- [x] `openapi.yaml` updated
- [x] Integration tests: create, list, update, delete, cross-user isolation

### T-044 — Standalone Note CRUD API
Depends on: T-042 · SRS: §13.1

- [x] `POST /works/:workId/notes` — scope required; `position` required unless scope is BOOK or SESSION
- [x] `GET /works/:workId/notes`
- [x] `PATCH /notes/:id`
- [x] `DELETE /notes/:id`
- [x] `openapi.yaml` updated
- [x] Integration tests

### T-045 — Annotation & note search
Depends on: T-043, T-044 · SRS: §13 (notes/highlights are only useful if findable at scale)

Postgres full-text search, scoped to the authenticated user's own
content only. Semantic/pgvector search is explicitly Phase 10 (SRS
§36.2) — not this ticket.

- [x] `GET /annotations/search?q=` across the user's highlights, quotes, and notes
- [x] `openapi.yaml` updated
- [x] Integration tests (correctness and cross-user isolation; relevance ranking is not a requirement here)

### T-046 — Migrate reader highlight/quote UI off localStorage
Depends on: T-043 · SRS: §13.2, §13.3, §13.4, §6.3 (manual override — edit/delete stays available)

Replaces `lib/annotations.ts`'s localStorage implementation with
T-043's API in both `FlowReaderPage.tsx` and `ReaderPage.tsx`, so
highlights/quotes follow the account across devices.

- [x] `lib/api/annotations.ts` React Query hooks (list/create/update/delete)
- [x] `AnnotationsDrawer.tsx` and both readers' `handleSaveHighlight` wired to the API
- [x] `lib/annotations.ts` (localStorage) removed once nothing references it
- [x] Loading/error/empty states in the drawer
- [x] Frontend tests updated; no regression in the create/edit/delete flow

### T-047 — Standalone note UI
Depends on: T-044 · SRS: §13.1

New UI surface — standalone notes aren't a highlight's margin note
(T-046 already covers that); this is the book/chapter/session-level
note §13.1 describes, with no required text selection.

- [x] "Add note" entry point in the reader (book-level, current-chapter-level) and in the physical session flow (session-level)
- [x] Notes list/edit/delete UI
- [x] Frontend tests

### T-048 — Annotation search UI
Depends on: T-045, T-046 · SRS: §13

- [x] Search box in `AnnotationsDrawer` hitting T-045's endpoint
- [x] Empty/no-results state
- [x] Frontend tests

### T-049 — Journal integration
Depends on: T-046, T-047 · SRS: §12.5, §13

Annotations and notes made during a session appear inline in that
session's journal entry, per the Phase 6 objective in
`IMPLEMENTATION_PLAN.md` §5.

- [x] `journal.service.ts` includes each session's linked annotations/notes (via `sessionId`)
- [x] `JournalPage.tsx` renders them inline per entry
- [x] Backend + frontend tests

---

## Phase 7 — Reviews & Reading Insights (Fast-Follow v1.1)

Scoped per `IMPLEMENTATION_PLAN.md` §6. Lets users rate/review
finished books (SRS §14) and replaces T-023's three-number baseline
with the real stats/trends picture SRS §19 describes. The plan itself
notes this phase is most useful once the MVP has real usage data —
nothing technically blocks starting now, but the analytics tickets
(T-053 onward) will read better against real session history than
fixtures alone.

### T-050 — Review & Rating schema
Depends on: none · SRS: §14

`Review` model: one per user per work, optional 1-5 `rating` (SRS §14's
"configurable scale, 5-star default" — MVP hardcodes 5; nullable
because SRS §14 lists rating, review text, favourite and reread
intention as independent actions), optional `body`, `isFavourite`,
`rereadIntention`, and an open `metadata` field for structured extras
(e.g. favourite character) per SRS §14's "other structured metadata"
line. Add to `DATA_MODEL.md` (removing it from the Phase 7+ deferred
list) and generate the Prisma migration in the same change, per
`AGENTS.md` §3.

- [x] `Review` model added to `schema.prisma` + migration
- [x] `DATA_MODEL.md` updated (schema block + relations list)
- [x] One review per `(userId, workId)` enforced at the DB level

### T-051 — Review & Rating CRUD API
Depends on: T-050 · SRS: §14

`GET/PUT/PATCH/DELETE /works/:workId/review` — singular, since there's
one review per user per work. `PUT` is create-or-replace (no separate
"rate" vs "review" endpoints, no "already reviewed" error), `PATCH`
partially updates an existing review, `GET` returns the caller's own
(404 when none).

- [x] Create, update, delete, and get-own-review endpoints
- [x] Authorisation scoped to the review's owner
- [x] `openapi.yaml` updated
- [ ] Integration tests (CRUD, ownership isolation, the one-per-work constraint) — *written (`backend/tests/reviews.spec.ts`), not yet run: deferred to the end-of-project test pass*

### T-052 — Review & Rating UI
Depends on: T-051 · SRS: §14

Star-rating widget, review text, and favourite/reread toggles on
`BookDetailPage.tsx` — same "add a panel to the book detail page"
pattern as `ShelfAssignmentPanel`/`NotesPanel` (T-047).

- [x] Star rating input (1-5) with the caller's existing rating pre-filled
- [x] Review body textarea (create/edit/delete)
- [x] Favourite and reread-intention toggles
- [x] Frontend tests

### T-053 — Extended statistics service & API
Depends on: T-023 · SRS: §19.1

Replaces `BasicStatistics`'s three fields with the full SRS §19.1
list this phase is scoped to land: pages read (estimated for
reflowable formats per §19.3), total reading sessions, average
session duration, longest streak (current streak already exists —
T-023), and breakdowns by genre/author/language/format (all already
on `Work`/`Edition` — no new schema needed, just aggregation).

- [x] `getExtendedStatistics` computes every SRS §19.1 field
- [x] Breakdowns by genre, author, language, and format
- [x] `GET /statistics` response extended (`openapi.yaml` updated — note any field removed/renamed from the T-023 shape)
- [ ] Fixture-based tests (numbers reconcile against a known session set, same bar T-023 set) — *written (`backend/tests/statistics.spec.ts`), not yet run: deferred to the end-of-project test pass*

### T-054 — Streak logic hardening
Depends on: T-023 · SRS: §19.1 (edge cases flagged in `IMPLEMENTATION_PLAN.md` §6)

`computeCurrentStreak` (`statistics.service.ts`) currently buckets
sessions by UTC calendar day via `toISOString().slice(0, 10)` — a
session just after local midnight but before UTC midnight (or vice
versa) can land on the wrong day, and DST transitions aren't
considered at all. Harden this before building trends on top of it.

Decision: the client sends its IANA zone as `?tz=` on each stats
request (default `UTC`, so T-023's behaviour is unchanged when it's
omitted) — no new `User.timezone` column. Sessions are bucketed into
local calendar dates via `Intl`, and all streak/trend arithmetic then
runs on those plain dates, so DST never enters the math
(`statistics/day-buckets.ts`). Trade-off: reading done while travelling
is bucketed by the zone in effect when the stats are viewed.

- [x] Day-bucketing uses a day boundary the user actually experiences, not a bare UTC slice (document the chosen approach — e.g. a user-level timezone field vs. request-supplied offset — since none exists in the schema yet)
- [x] Longest-streak calculation (new, for T-053) shares this same day-bucketing logic — not a second implementation
- [ ] Tests covering a DST transition, a session just before/after local midnight, and a multi-day gap — *written (`backend/tests/statistics.spec.ts`), not yet run: deferred to the end-of-project test pass*

### T-055 — Time-based statistics views
Depends on: T-053 · SRS: §19.2

Daily/weekly/monthly/yearly/all-time aggregation of the T-053 metrics,
per SRS §19.2.

Decision: a separate `GET /statistics/trends?range=` endpoint (its
response is a bucket series, a different shape from `/statistics`).
daily = last 30 days, weekly = last 12 ISO weeks, monthly = last 12
months, yearly = first session's year to now, all-time = one bucket.

- [x] `GET /statistics/trends?range=daily|weekly|monthly|yearly|all-time` (or equivalent query param on the existing endpoint — pick one, document the choice)
- [x] Each range buckets correctly at its boundaries (reuses T-054's day-bucketing)
- [x] `openapi.yaml` updated
- [ ] Tests across all five ranges — *written (`backend/tests/statistics.spec.ts`), not yet run: deferred to the end-of-project test pass*

### T-056 — Reading pace calculations
Depends on: T-053 · SRS: §19.3

Pages/hour and pages/session, computed only where SRS §19.3's "enough
reliable data exists" — for reflowable digital formats, uses an
estimated equivalent-progress figure rather than literal pages (same
spirit as the continuity engine's proportional-position fallback).

- [x] Pace fields return `null` rather than a misleading number when data is insufficient (define and document the threshold)
- [x] Reflowable-format progress uses an estimated-equivalent-pages figure, not a literal page count
- [ ] Tests for both the "enough data" and "not enough data" paths — *written (`backend/tests/statistics.spec.ts`), not yet run: deferred to the end-of-project test pass*

### T-057 — Frontend stats dashboard
Depends on: T-053, T-055, T-056 · SRS: §19

Replaces `StatisticsPage.tsx`'s current three-number display with a
real dashboard: the extended metrics, the time-range views, and the
breakdowns, each as an appropriate chart/visualization rather than
bare numbers.

- [x] Extended metrics, breakdowns, and time-range views all rendered
- [x] Time-range selector (daily/weekly/monthly/yearly/all-time)
- [x] Loading/error/empty states (a new account with no sessions yet)
- [x] Frontend tests

---

## Phase 8 — Soundtrack (Future v2+)

Scoped per `IMPLEMENTATION_PLAN.md` §7 and SRS §17. Optional music
alongside reading — never a replacement for a streaming service
(§17.1), always off until the reader turns it on, and independent of
reading progress. SRS §38.4's risk (providers restricting playback or
API access) drives T-058's decision, which shapes everything after it.

### T-058 — Soundtrack provider abstraction (spike)
Depends on: none · SRS: §17.6, §38.4

Decision: Bunko plays music by embedding each provider's **official
embed player** for a playlist link the user pastes (Spotify, YouTube,
Apple Music, SoundCloud) — no API keys, no OAuth, no audio ever passing
through or stored on Bunko's servers (§17.6 "shall not store or
redistribute copyrighted music"). A link is parsed against a strict
host allowlist into `{ provider, embedUrl, capabilities }`; anything
else is rejected with a clear message (§38.4 "graceful fallback").
Full-account integrations (Spotify Web Playback SDK, Apple MusicKit)
need developer credentials and paid user accounts — deferred until a
real need justifies them.

- [x] URL → provider/embed parser with a strict host allowlist (arbitrary URLs never become iframes)
- [x] Per-provider capability flags (e.g. whether volume is controllable from Bunko or only in the provider's player — §17.7 "where permitted")
- [x] Decision recorded in `ARCHITECTURE.md`
- [ ] Tests covering each provider's link shapes and the rejection cases — *written (`backend/tests/soundtracks.spec.ts`), not yet run: deferred to the end-of-project test pass*

### T-059 — Soundtrack & SoundtrackMapping schema
Depends on: T-058 · SRS: §17.2, §17.3

`Soundtrack` = one of the user's playlists (name, source URL,
provider). `SoundtrackMapping` = an association of a soundtrack with a
target — a book (`WORK`, §17.3's "dedicated soundtrack"), a `SHELF`, a
`GENRE`, a `MOOD`, or a reading `SITUATION` (§17.2) — one playlist per
target. Free-text keys (genre/mood/situation) are normalised
(trimmed, lowercased) so "Fantasy" and "fantasy" are one target.

- [x] Both models + migration; `DATA_MODEL.md` updated
- [x] One mapping per `(userId, targetType, targetKey)`; deleting a soundtrack removes its mappings
- [x] Deleting a shelf or removing a book from the library removes mappings that pointed at it

### T-060 — Soundtrack library & association API
Depends on: T-059 · SRS: §17.2, §17.4

- [x] `GET/POST /soundtracks`, `PATCH/DELETE /soundtracks/:id` (URL validated through T-058's parser); each soundtrack carries its mappings, so there's no separate mapping list endpoint
- [x] `PUT /soundtrack-mappings` (upsert by target), `DELETE /soundtrack-mappings/:id`
- [x] `WORK`/`SHELF` targets must belong to the caller; a soundtrack can only be mapped by its owner
- [x] `openapi.yaml` updated
- [ ] Integration tests (CRUD, validation, ownership isolation) — *written (`backend/tests/soundtracks.spec.ts`), not yet run: deferred to the end-of-project test pass*

### T-061 — Automatic soundtrack resolution
Depends on: T-060 · SRS: §17.2, §17.3, §17.7

`GET /works/:workId/soundtrack` picks what "automatic" mode plays for a
book: its own soundtrack first, then a shelf it's on, then one of its
genres. Moods and situations aren't attributes of a book, so they're
manual picks in the player (T-064), not automatic inputs.

- [x] Precedence book → shelf → genre, deterministic within each tier; response says which association matched
- [x] `null` (not an error) when nothing matches
- [x] `openapi.yaml` updated
- [ ] Integration tests for each tier and the no-match case — *written (`backend/tests/soundtracks.spec.ts`), not yet run: deferred to the end-of-project test pass*

### T-062 — Soundtracks page
Depends on: T-060 · SRS: §17.2, §17.4

A page to add/rename/remove playlists and associate them with genres,
shelves, moods (SRS §17.4's twelve defaults plus custom ones —
"configurable"), and reading situations.

- [x] Add a playlist by link, with the parser's error shown inline
- [x] Associate each playlist with moods, situations, genres, and shelves; remove associations
- [x] No third-party player loads until the reader explicitly previews a playlist (privacy: an embed contacts the provider)
- [x] Loading/error/empty states; frontend tests

### T-063 — Book soundtrack
Depends on: T-060, T-061 · SRS: §17.3

- [x] Panel on `BookDetailPage.tsx`: choose one of the reader's playlists as this book's soundtrack, or clear it
- [x] Shows what automatic mode would play when no book soundtrack is set, and why (shelf/genre)

### T-064 — Reader soundtrack player
Depends on: T-061 · SRS: §17.7

- [x] Toolbar entry in both readers opening a small player: enable/disable, automatic vs manual (pick a playlist, mood, or situation)
- [x] "Stop" ends playback immediately (unmounts the player); hiding the panel keeps music playing with a visible now-playing control
- [x] Volume from Bunko only where the provider permits it; otherwise the provider's own controls
- [x] Off by default; on/off and mode are per-device preferences (music on a laptop shouldn't start it on a phone)
- [x] Playback is independent of reading progress (page turns never interrupt or change it)
- [x] Frontend tests

---

## Phase 9 — Offline & Sync (Future v2+)

Scoped per `IMPLEMENTATION_PLAN.md` §8 and SRS §21 (plus FR-021/022,
E2E-007/008, and §30's sync-conflict copy). T-065 is the design ticket
the plan requires before the rest; everything after it implements that
decision.

### T-065 — Sync & conflict-resolution design
Depends on: none · SRS: §21.1, §21.2, §21.3

Decision (full rationale in `ARCHITECTURE.md` §13):

- **The server stays the source of truth.** Devices only diverge while
  offline; online writes keep going straight to the existing REST API.
- **Devices** get a client-generated id (`X-Device-Id` on every request)
  registered as a `DeviceSession`, so writes can be attributed to a device.
- **Offline writes become events** in a client outbox (IndexedDB), each
  with a client-generated id and timestamp, replayed in order through
  `POST /sync/events`. Every event is recorded in `SyncEvent`, unique per
  user + client event id, so a retried batch never applies twice.
  Entities created offline use client-generated UUIDs as their real ids,
  so later offline edits/deletes can reference them.
- **Per-type rules (§21.2):** sessions are **append-only** (an offline
  session uploads as a finished session and never conflicts);
  annotations, notes, and bookmarks **merge** (creates are unioned, edits
  apply field-by-field only if the server copy hasn't changed since the
  edit was made, deletes win over concurrent edits); preferences are
  **last-write-wins per key** by client timestamp; the canonical reading
  position goes to **user resolution** when it was moved by a different
  device while this one was offline and the two positions differ — both
  are kept and the reader chooses (§30: "This book was updated on another
  device. Choose which reading position to continue from.").
- **Offline reading:** a service worker serves the app shell offline; a
  reader explicitly downloads a book they own, which stores the file, its
  manifest, and its chapters in IndexedDB. Offline, the reader runs from
  that store with a local session, and its writes go to the outbox.
- **Not synced, by design:** whether music is playing on a device (the
  soundtrack on/off switch — device state, not a preference); `Tag`s
  (§21.1 lists them, but no tagging feature exists to sync).

- [x] Decision recorded in `ARCHITECTURE.md` §13
- [x] Every §21.1 item mapped to a mechanism (server-native, merged event, LWW preference, or out of scope with reason)

### T-066 — Sync schema
Depends on: T-065 · SRS: §21, §27.1

`DeviceSession`, `SyncEvent` (with conflict status/resolution), `Bookmark`
(server-side, replacing per-browser `localStorage`), `UserPreference`
(per-key LWW), and `ReadingPosition.updatedByDeviceId` (who last moved the
canonical position — what conflict detection needs).

- [x] Models + migration; `DATA_MODEL.md` updated
- [x] `SyncEvent` unique per `(userId, clientEventId)`

### T-067 — Server-synced bookmarks
Depends on: T-066 · SRS: §21.1 (bookmarks)

- [x] `GET/POST /editions/:editionId/bookmarks`, `DELETE /bookmarks/:id` (owner-scoped like annotations)
- [x] Both readers use it instead of `lib/bookmarks.ts`'s `localStorage`; existing local bookmarks are imported once rather than dropped
- [ ] `openapi.yaml` updated; integration tests — *written (`backend/tests/bookmarks-preferences.spec.ts`), not yet run: deferred to the end-of-project test pass*

### T-068 — Synced preferences
Depends on: T-066 · SRS: §21.1, §21.2 (LWW for simple preferences), FR-021

- [x] `GET /preferences`, `PUT /preferences/:key` — applies only if the incoming client timestamp is newer than the stored one
- [x] Reader settings and soundtrack mode/volume/manual choice sync through it; the soundtrack on/off switch stays per-device (T-065)
- [ ] `openapi.yaml` updated; integration tests for the LWW rule — *written (`backend/tests/bookmarks-preferences.spec.ts`), not yet run: deferred to the end-of-project test pass*

### T-069 — Sync event ingestion
Depends on: T-066, T-067, T-068 · SRS: §21.2, §21.3

- [x] `POST /sync/events`: ordered batch, per-event result (`APPLIED`/`SKIPPED`/`CONFLICT`/`REJECTED`/`DUPLICATE`), idempotent replay
- [x] Handlers: offline session (append-only), annotation/note/bookmark create/update/delete (merge rules), preference set (LWW)
- [x] All ownership checks the online endpoints make, made here too
- [ ] `openapi.yaml` updated; integration tests (idempotency, each merge rule, cross-user isolation) — *written (`backend/tests/sync.spec.ts`), not yet run: deferred to the end-of-project test pass*

### T-070 — Reading-position conflicts
Depends on: T-069 · SRS: §21.2, §30, E2E-008

- [x] An offline session whose end position would overwrite a canonical position another device moved during that session is recorded as a conflict instead — nothing overwritten
- [x] `GET /sync/conflicts`, `POST /sync/conflicts/:id/resolve` (`SERVER` or `DEVICE`)
- [ ] Integration tests for conflict / no-conflict / same-position / resolution — *written (`backend/tests/sync.spec.ts`), not yet run: deferred to the end-of-project test pass*

### T-071 — Device identity
Depends on: T-066 · SRS: §21

- [x] Client device id + `X-Device-Id` header on every request; `POST /sync/devices` registers it on sign-in
- [x] Canonical position writes record the device; `GET /sync/devices` lists the account's devices (Settings)

### T-072 — Offline app shell & sign-in
Depends on: none · SRS: §21.3, FR-022

- [x] Service worker (production builds) serving the app shell and built assets offline; API calls are never cached
- [x] Offline start: a failed session refresh due to *no network* (not a 401) keeps the last signed-in user, scoped to this device's offline data, and retries when the network returns
- [x] Signing out clears that user's offline data on this device (warning first if changes are still waiting to sync)

### T-073 — Offline book downloads
Depends on: T-072 · SRS: §21.3, FR-022, §25

- [x] `GET /editions/:id/download` (file URL without starting a reading session, unlike the reader manifest)
- [x] "Download for offline" / "Remove download" per digital edition; stores file, manifest, chapters, and an annotation snapshot in a per-user IndexedDB database
- [x] Shows device storage use; only the reader's own copies can be downloaded

### T-074 — Offline reader
Depends on: T-073, T-075 · SRS: §21.3

- [x] Both readers open a downloaded book with no network (file from the local store), resuming from the last local position
- [x] An offline reading session is recorded locally and queued as one event when it ends; a session left open (tab closed) is closed and queued on next start
- [x] Annotations, notes, and bookmarks made offline appear immediately and queue for sync

### T-075 — Client sync outbox
Depends on: T-069, T-071 · SRS: §21.3

- [x] IndexedDB outbox; flushes on reconnect, on start, and periodically while non-empty; holds back events tied to a still-open offline session
- [x] Visible status: offline / "N changes waiting to sync" / syncing
- [x] Refreshes affected data after a flush

### T-076 — Conflict resolution UI
Depends on: T-070, T-075 · SRS: §21.2, §30

- [x] After a sync, unresolved position conflicts prompt the reader with §30's copy and both positions (chapter, device, time)
- [x] Choosing one resolves it; dismissing keeps it pending for later
- [x] Frontend tests for the client-side pieces (outbox ordering/hold-back, device label, offline detection)

---

## Ticket Count Summary

| Phase | Tickets | Status |
|---|---|---|
| 1 — Foundation | T-001, T-001a, T-001b, T-002 – T-011 (13) | **100% Complete** |
| 2 — Book Management | T-012 – T-017 + T-013a (7) | **100% Complete** |
| 3 — Reading Tracking | T-018 – T-023 (6) | **100% Complete** |
| 4 — Digital Reading | T-024 – T-031 (8) | **100% Complete** |
| 5 — Unified Reading | T-032 – T-037 + T-037a (7) | **100% Complete** |
| Cross-cutting Frontend | T-038 – T-041 (4) | **100% Complete** |
| **Total (MVP)** | **45** | **100% Complete** |
| 6 — Annotations | T-042 – T-049 (8) | **100% Complete** |
| 7 — Reviews & Reading Insights | T-050 – T-057 (8) | **Implemented — backend integration tests written, not yet run** |
| 8 — Soundtrack | T-058 – T-064 (7) | **Implemented — backend integration tests written, not yet run** |
| 9 — Offline & Sync | T-065 – T-076 (12) | **Implemented — backend integration tests written, not yet run** |

Phase 10 (AI) tickets are intentionally not written yet — see
`AGENTS.md` §3. Do not pre-create them. When Phase 10 (AI Layer)
begins, its tickets will scaffold a separate `ai-service/`
(Python/FastAPI) per `ARCHITECTURE.md` §8 — not a module inside
`backend/`.
