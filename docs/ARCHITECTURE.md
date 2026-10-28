# Bunko — Architecture

This document translates the logical architecture in `SRS.md` §7 into
concrete technical decisions. The SRS is intentionally
technology-agnostic; this document is not — it is the binding
implementation choice for MVP (Phases 1-5).

## 1. Stack Summary

| Layer | Choice | Why |
|---|---|---|
| Backend language/runtime | TypeScript / Node.js 20 | Single language across backend and frontend; strong ecosystem for EPUB/PDF parsing. |
| Backend framework | Express | Minimal, unopinionated — explicit routing/middleware over hidden DI magic, chosen for this project. |
| Database | PostgreSQL 16 | Relational integrity fits the SRS §27 entity graph (User → Work → Edition → Copy, etc.); mature, well-supported. `pgvector` extension enabled from the start (unused by MVP, reserved for Phase 10 AI embedding search — see §8). |
| ORM | Prisma | Type-safe schema-as-code, migration tooling; framework-independent, so the switch from NestJS to Express does not affect the data layer. |
| Cache / job queue | Redis + BullMQ | Background jobs (EPUB indexing, thumbnail generation, future notifications) need a queue; Redis doubles as cache. |
| Object storage | S3-compatible (AWS S3 prod, MinIO local) | Digital book files and cover images must not live in the app DB or filesystem (SRS §24). |
| Request validation | Zod | Express has no built-in validation pipeline (unlike NestJS pipes); Zod schemas double as TypeScript types and are kept 1:1 with `openapi.yaml` request bodies. |
| API documentation | OpenAPI 3.0 + `swagger-ui-express` | `docs/openapi.yaml` is hand-maintained as the binding contract and served interactively at `GET /api/docs`. |
| Frontend framework | React 18 + TypeScript + Vite | MVP targets web first (see §6); fast dev loop, large ecosystem for EPUB/PDF rendering libraries. |
| Frontend data layer | TanStack Query | Server-state caching/sync fits a read-heavy library/reader app. |
| Styling | Tailwind CSS | Fast to build a calm, book-centric UI (SRS §2.3) without a heavy design-system dependency. |
| EPUB rendering | epub.js | De facto standard for in-browser EPUB rendering with location/CFI support needed for SRS §11 mapping. |
| PDF rendering | pdf.js | Mozilla's PDF renderer; needed for SRS §10 reader and §11.6 page-fallback indexing. |
| Auth | JWT (access + refresh) via custom Express middleware | Stateless API auth; refresh rotation for security (see `SECURITY.md`). No framework-provided guards — auth is one middleware function, explicit in every route file. |
| Testing | Playwright | Single framework for both API/integration tests (via Playwright's `request` fixture, no browser needed) and browser E2E — see `docs/TESTING_STRATEGY.md`. |
| CI | GitHub Actions | Lint, typecheck, test on every PR (see `.github/workflows/ci.yml`). |
| Local dev orchestration | Docker Compose | Postgres, Redis, MinIO spun up identically for every contributor/agent. |
| AI services (Phase 10, future) | Python 3.12 + FastAPI, separate service | See §8. Not built during MVP. |

This stack is the binding decision for MVP. Changing it after Phase 1
begins is a requirement change (see `SRS.md` Requirement Change
Policy).

## 2. Why Express (Not a Batteries-Included Framework)

Express gives explicit, unhidden control over routing, middleware
order, and request handling — no decorators, no dependency-injection
container, no convention-over-configuration to reverse-engineer. Every
route file shows exactly what runs and in what order. The trade-off is
that patterns NestJS provides for free (guards, pipes, interceptors)
are implemented here as plain middleware functions, documented in
`docs/CODING_STANDARDS.md` §3-§6, and must be applied consistently by
convention rather than enforced by a framework.

## 3. Service Boundaries (maps to SRS §7)

Implemented as Express route modules within a single backend app for
MVP (modular monolith, not microservices — see §5 rationale). Each
module is a folder, not a framework-level construct:

```
backend/src/modules/
├── auth/              # FR-001, FR-002 — registration, login, JWT
├── users/             # user profile, account settings
├── library/           # books/works, authors, series, and search/filter
│                      # (SRS §18 has no separate URL prefix — it's query
│                      # params on GET /works — so it lives here rather
│                      # than in a standalone search/ module)
├── metadata/          # external book metadata search, Open Library (SRS §16)
├── editions/          # editions, copies, digital files
├── files/             # upload, storage, signed URLs (SRS §24)
├── reader/            # EPUB/PDF parsing, indexing (SRS §10, §11.6)
├── continuity/        # cross-edition mapping engine (SRS §11.7-11.9)
├── reading-sessions/  # session lifecycle (SRS §12)
├── journal/           # chronological journal view (SRS §12.5)
├── statistics/        # reading statistics & trends (SRS §19 — T-023, Phase 7)
├── annotations/       # highlights/quotes + annotation search (SRS §13 — Phase 6)
├── notes/             # standalone book/chapter/session notes (SRS §13.1 — Phase 6)
├── reviews/           # ratings & reviews (SRS §14 — Phase 7)
├── soundtrack/        # playlists & associations, provider embeds (SRS §17 — Phase 8, see §12)
├── bookmarks/         # server-synced bookmarks (SRS §21.1 — Phase 9)
├── preferences/       # last-write-wins user preferences (SRS §21.2 — Phase 9)
├── sync/              # devices, offline event replay, position conflicts (SRS §21 — Phase 9, see §13)
├── ai/                # consent, daily cap, proxy to ai-service (SRS §20 — Phase 10, see §8)
└── shelves/           # shelves, tags, collections (SRS §15)
```

Each module folder follows the same internal shape (see
`CODING_STANDARDS.md` §3 for the file-by-file breakdown): routes →
controller → service → Prisma, with a Zod schema file shared between
validation and OpenAPI generation intent.

Not implemented: `notifications` (SRS §22 — optional, not on the
phase roadmap). The AI models themselves run in the separate
`ai-service/` (§8), not in this app.
Do not create these directories until their phase begins.

## 4. Request Flow (example: opening a digital book)

```
Client (React Reader)
   |
   | GET /api/v1/editions/:id/reader-manifest
   v
authMiddleware  ->  verifies JWT, attaches req.user
   |
validate(readerManifestParamsSchema)  ->  Zod validation middleware
   |
reader.controller.ts  ->  reader.service.ts
   |
   +-- files.service.ts --> S3: signed URL for EPUB/PDF blob
   +-- continuity.service.ts --> resolve last reading position (SRS §11)
   +-- reading-sessions.service.ts --> auto-start session (SRS §12.8)
   |
   v
errorHandler middleware (only if something throws) -> envelope response
   |
   v
Response: { data: { fileUrl, startPosition, sessionId } }
   |
   v
Client: epub.js/pdf.js loads file, navigates to startPosition,
        begins reporting position updates every N seconds
```

## 5. Why a Modular Monolith (Not Microservices) for MVP

SRS §7 lists many logical services (auth, library, reading, journal,
annotation, file, search, sync, notification, music, AI). Standing
these up as separate deployable services before a single user exists
would violate the complexity risk flagged in `SRS.md` §38.7. A modular
monolith with clean folder boundaries (§3 above) gives the same
logical separation and can be split into real services later if a
specific module (e.g. AI, Phase 10 — see §8) needs independent scaling.
The AI layer is the one exception, deliberately split out from day one
— see §8.

## 6. Client Strategy

MVP ships a responsive web client only. A native mobile client is
out of MVP scope (not listed in `SRS.md` §36 Phases 1-5) but the
API-first design (all functionality behind versioned REST endpoints,
documented in `docs/openapi.yaml`, no server-rendered views) means a
React Native or native client can be added later without backend
changes.

## 7. API Documentation (Swagger)

`docs/openapi.yaml` is the binding contract (see `AGENTS.md` §1). It is
served two ways:

1. **Interactively** at `GET /api/docs` via `swagger-ui-express`,
   loading the YAML file directly — no code-generation step, so the
   docs can never drift into a separately-maintained copy.
2. **As a static file** at `GET /api/openapi.yaml` for tooling
   (Postman import, client codegen, etc.).

Zod schemas in each module (`*.schema.ts`) are written to mirror the
OpenAPI request/response shapes. If they diverge, treat it as a bug —
one of the two is wrong, per `CODING_STANDARDS.md` §3.

## 8. AI Services (Phase 10)

SRS §20 (AI Capabilities) and Phase 10 (`SRS.md` §36.2) call for AI
features once a real corpus of user notes/sessions exists. The
decision, recorded now so later work doesn't re-litigate it:

- **Stack:** Python 3.12 + FastAPI, as a **separate service**
  (`ai-service/` at the repo root, sibling to `backend/` and
  `frontend/`), not a module inside the Express app. Python's ML/NLP
  ecosystem is the deciding factor over keeping everything in Node.
- **Data access:** The AI service reads from the **same PostgreSQL
  instance** as the Express API (per the product owner's direction),
  rather than a separate database technology. `pgvector` is enabled
  on that instance now (§1) specifically so embedding-based search
  (semantic search over notes/quotes, SRS §20) can be added later
  without a data-migration project. The AI service should use its own
  least-privilege DB role, scoped to only the tables/columns it needs
  — it must not share the Express API's DB credentials.
- **Integration:** The Express API calls the AI service over internal
  HTTP (not exposed publicly); the AI service never talks to clients
  directly. This keeps auth, rate-limiting, and user-scoping in one
  place (the Express API) rather than duplicated in Python.
- **As built (T-077–T-086).** `ai-service/` serves internal endpoints for
  indexing, semantic search, and generation. Embeddings come from a
  **local** model (fastembed, `BAAI/bge-small-en-v1.5`, 384 dimensions),
  so semantic search never sends content to a third party; generated
  insights call **NVIDIA NIM** (migrated from the Claude API in Phase 13,
  T-106 — see the Change Log — matching the assistant chat's provider
  below). `ai-service/app/llm.py`'s `Llm` class wraps the NVIDIA
  chat-completions endpoint behind a stable interface
  (`generate_json`/`generate_text`); structured output is produced by
  embedding the target JSON Schema in the system prompt and parsing the
  reply, with one retry on malformed JSON, rather than relying on a
  provider-native structured-output mode. A primary model
  (`NVIDIA_MODEL`) and fallback models (`NVIDIA_FALLBACK_MODELS`) are
  tried in order on a per-model failure (observed live: one hosted model
  can 404 "not found for account" while another on the same key answers
  normally) — a bad key or rate limit, which applies to every model
  alike, is not retried against the others. Two separate per-user
  consents, both off by default, gate them (`AiConsent`); the Express
  `ai/` module enforces consent, scoping, and a daily generation cap, and
  deletes a user's embeddings directly when they revoke. Without
  `AI_SERVICE_URL`/`AI_SERVICE_TOKEN` (API) or `NVIDIA_API_KEY`
  (ai-service), the features report unavailable instead of failing. The
  service runs under the `ai` Compose profile with the least-privilege
  role from `ai-service/scripts/create_ai_role.sql`. What reaches the
  provider, and when, is set out in `docs/AI_DATA_POLICY.md`.
- **Chapter translation (Phase 11, T-087–T-092; provider migrated in
  T-107).** This follows the same boundary. The Express `ai/` module
  checks the third consent (`translation`), ownership of a digital copy,
  the chapter's length, and a daily character budget. It then queues a
  BullMQ job (`translation.worker.ts`) that splits the chapter at
  paragraph boundaries and sends each piece to ai-service's
  `/internal/translate`, which calls NVIDIA NIM and returns the reply.
  Express sends the chapter text itself, so ai-service needs no new
  database access. Results are stored per user in `ChapterTranslation`
  and never shared across users (SRS §25.4). The flow reader renders a
  translated chapter in place of the original, through the same
  template.
- **Library assistant chat (Phase 12, T-093–T-105).** This reuses the
  RoninArc AI module, and it runs inside the Express API, not ai-service,
  because its tools call Bunko's own services.
  - `backend/src/modules/assistant/` holds the domain-neutral **core**
    (conversation state, planning, entity resolution, execution, replies).
  - `assistant/domains/books/` is the **books pack**: its tools,
    prompts, title matching, and plan corrections.
  - Core files never import the pack or Bunko's modules, which a purity
    test enforces. Only the composition root (`aiController.ts`) does,
    and that is also where consent (generated insights) and the daily
    cap are applied, by wrapping the provider.
  - The model sits behind the core's `AIProvider` interface and a
    provider registry keyed by `AI_PROVIDER` (`nvidia` first, plus
    `ollama` and the test `mock`), so changing the provider is
    configuration, and adding one is one class.
  - Conversation state is in process memory (the last six exchanges), so
    it suits one API instance; a second instance would need a shared
    store.

## 9. Folder Structure (top level)

```
bunko/
├── backend/
│   ├── src/
│   │   ├── modules/     # see §3 above
│   │   ├── middleware/  # auth, validation, error handling
│   │   ├── config/      # env loading, constants
│   │   ├── docs/        # swagger-ui-express wiring
│   │   ├── app.ts       # Express app + middleware assembly
│   │   └── server.ts    # entrypoint
│   ├── prisma/          # schema.prisma, migrations/
│   └── tests/           # Playwright API/integration tests
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── features/    # one folder per domain area, mirrors backend modules
│   │   └── lib/          # api client, query hooks
│   └── e2e/              # Playwright browser E2E tests
├── ai-service/            # Phase 10 — not created during MVP, see §8
├── docs/
└── .github/workflows/
```

## 10. Environments

| Env | Purpose | Notes |
|---|---|---|
| `local` | Agent/developer machine | Docker Compose: Postgres (with pgvector), Redis, MinIO |
| `staging` | Pre-production validation | Mirrors prod config, seeded test data |
| `production` | Live | See `SRS.md` §34 for full deployment requirements |

Deployment target (containers on a managed platform, e.g. AWS
ECS/Fargate or Fly.io) is left open per SRS §34 flexibility; CI builds
a container image regardless of final hosting choice.

## 11. Book Metadata Provider (SRS §16)

Adding a book (T-013) needs a source for title/author/cover/ISBN
metadata rather than requiring the user to type everything by hand.

**Decision: Resilient Multi-Tier Waterfall (Google Books -> Open Library -> Inventaire.io).**

| Provider | Role | Cost / Auth | Cover Resolution & Data Richness |
|---|---|---|---|
| **Google Books** | Tier 1 (Optional) | Free tier (~1,000 req/day); requires `GOOGLE_BOOKS_API_KEY` | High-res cover images, comprehensive synopses, fast response time |
| **Open Library** | Tier 2 (Default primary) | Free, no API key required | Enhanced with multi-key cover fallback (`cover_i` -> `cover_edition_key` -> `isbn[0]`), first-sentence previews, 4s timeout |
| **Inventaire.io** | Tier 3 (Zero-config fallback) | Free, no API key required, open book catalog backed by Wikidata | Fast sub-second search, entity WebP images, Wikidata work summaries, robust fallback when Open Library times out |

**Integration pattern:**

- `GET /api/v1/metadata/search?q=` (`openapi.yaml`) executes the waterfall:
  1. If `GOOGLE_BOOKS_API_KEY` is configured in `.env`, Google Books is queried first.
  2. Otherwise (or if Google Books returns empty/errors), Open Library is queried with multiple cover fallbacks and a 4-second timeout.
  3. If Open Library times out, fails, or returns no results, Inventaire.io is queried immediately as a zero-config fallback.
  4. Degrades gracefully to `[]` on total upstream failure (never a 500 error, T-013a).
- The candidate shape is provider-agnostic (`title`, `authors`, `coverImageUrl`, `firstPublishYear`, `externalSource`, `externalId`, optional `description`).
- When a candidate is selected:
  - If a synopsis/description was provided in the search candidate (e.g. from Google Books or Inventaire), `createWork` saves it directly without a redundant round-trip fetch.
  - If missing, `fetchWorkDescription(source, externalId)` fetches it once from the respective provider.
- The stored `Work` row is the source of truth after creation — external APIs are never queried on page load.
- The user can still skip search and enter a book manually (`externalSource`/`externalId` left `null`).

## 12. Soundtrack Providers (SRS §17, Phase 8)

SRS §38.4 warns that music services restrict background playback, API
access, and playlist control; §17.6 forbids storing or redistributing
copyrighted music.

**Decision: official embed players only, from user-pasted links (T-058).**

- A reader adds a playlist by pasting a share link. `soundtrack/providers.ts`
  parses it against a strict host allowlist (Spotify, YouTube/YouTube
  Music, Apple Music, SoundCloud) into the provider's **official embed
  player** URL. Anything else is rejected with a specific message — an
  arbitrary URL never becomes an iframe. The embed URL is derived from
  the stored link on every read, so a parser fix applies retroactively.
- Bunko never fetches, proxies, caches, or stores audio. Playback happens
  entirely inside the provider's player, under the provider's own
  account, licensing, and autoplay rules.
- No API keys or OAuth. Full-account integrations (Spotify Web Playback
  SDK, Apple MusicKit) would need developer credentials and paid user
  accounts; they're deferred until a concrete need outweighs that cost.
- Capabilities are per provider (`PROVIDER_CAPABILITIES`): YouTube and
  SoundCloud embeds accept volume commands over `postMessage`, so Bunko
  offers a volume control for them; Spotify and Apple Music don't, so
  volume stays in their player or the device (§17.7 "where permitted").
- Privacy: no third-party player loads until the reader turns the
  soundtrack on or explicitly previews a playlist, and YouTube embeds
  use `youtube-nocookie.com`.

## 13. Offline & Sync (SRS §21, Phase 9)

**Decision: online-first with an event outbox for offline writes (T-065).**

The server stays the single source of truth. Online, every write goes
straight to the existing REST endpoints exactly as before — there is no
background replication layer to keep consistent. Devices can only
diverge while offline, so sync is a question of how to replay offline
writes deterministically (§21.2).

**Mechanics**

- **Device identity.** Each browser generates a device id once and sends
  it as `X-Device-Id` on every request; `POST /sync/devices` registers it
  as a `DeviceSession`. Writes that need attribution — moving the
  canonical reading position — record the device.
- **Outbox.** Offline writes are stored as events in IndexedDB, each
  with a client-generated id and timestamp, and replayed in order via
  `POST /sync/events` when connectivity returns. Each event is recorded
  in `SyncEvent`, unique per `(userId, clientEventId)`, so a batch
  retried after a dropped response never applies twice. Entities
  created offline use client-generated UUIDs as their real ids, so a
  later offline edit or delete can reference them before the server has
  ever seen them.
- **Ordering.** Annotations made during an offline reading session are
  held back until that session has been queued, so the session exists
  server-side before anything links to it.

**Deterministic rules per data type (§21.2)**

| Data | Rule |
|---|---|
| Reading sessions | Append-only. An offline session uploads as a finished session; sessions never conflict with each other. |
| Annotations (highlights, quotes), notes, bookmarks | Explicit merge. Creates from different devices are unioned. An edit applies field-by-field only if the server row hasn't changed since the edit was made (otherwise the newer server value stands). Deletes win over concurrent edits; an edit to something already deleted is skipped. |
| Simple preferences (reader settings; soundtrack mode, volume, manual choice) | Last-write-wins per key, by client timestamp. |
| Canonical reading position | If another device moved it while this one was offline *and* the positions differ, nothing is overwritten: both are kept as a conflict for the reader to resolve (§30 copy). Otherwise the offline session's end position applies normally. Concurrent divergent progress is the "low confidence" case §21.2 means — Bunko can't know which device reflects where the reader really is. |

**SRS §21.1 coverage**

| §21.1 item | How it syncs |
|---|---|
| library, books, editions, reading status, shelves, reviews | Server-native: online-only writes, already shared by every device. |
| reading position | Append-only sessions + conflict resolution above. |
| sessions | Append-only offline session events. |
| notes, highlights, quotes | Merged offline events. |
| bookmarks | Server-side `Bookmark` (was per-browser `localStorage` before Phase 9) + merged offline events. |
| soundtrack preferences | Playlists and associations are server-native (Phase 8); mode, volume, and manual choice are LWW preferences. Whether music is *playing* on a device stays device-local — that's device state, not a preference. |
| tags | Not applicable: no tagging feature exists (`DATA_MODEL.md` §5). |
| (FR-021) supported preferences | Reader settings as an LWW preference. |

**Offline reading (§21.3, FR-022)**

- A service worker (production builds only) serves the app shell and
  built assets offline. It never caches API responses or book files.
- A reader explicitly downloads a book they own ("Download for
  offline"): the file, its manifest, its chapter text, and an annotation
  snapshot go into a per-user IndexedDB database. Nothing is downloaded
  implicitly, and only the reader's own copies are eligible (§25).
- Starting offline: if the session refresh fails because there's no
  network (as opposed to a 401), the last signed-in user is kept for
  this device's offline data, and the refresh is retried when the
  network returns. Signing out deletes that user's offline data from the
  device (with a warning first if changes are still waiting to sync).
- Offline, the readers run from the local store with a local session
  whose id becomes the server session's id when it syncs. Annotations,
  notes, and bookmarks made offline appear immediately and queue in the
  outbox.
