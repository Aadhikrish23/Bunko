# Bunko — MVP Task Backlog

Tickets for Phases 1-5 (`SRS.md` §36.1). Work top-to-bottom within a
phase; do not start a later phase until the current one's tickets are
merged, unless a ticket's "Depends on" field says otherwise. See
`AGENTS.md` for how to pick up a ticket.

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

Phase 6+ tickets (Annotations, Reviews, Soundtrack, Offline/Sync, AI)
are intentionally not written yet — see `AGENTS.md` §3. Do not
pre-create them. When Phase 10 (AI Layer) begins, its tickets will
scaffold a separate `ai-service/` (Python/FastAPI) per
`ARCHITECTURE.md` §8 — not a module inside `backend/`.
