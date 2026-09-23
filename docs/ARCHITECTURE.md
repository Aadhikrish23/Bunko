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
├── statistics/        # baseline reading statistics (SRS §19, T-023)
├── annotations/       # notes/highlights/quotes — Phase 6, stubbed only
└── shelves/           # shelves, tags, collections (SRS §15)
```

Each module folder follows the same internal shape (see
`CODING_STANDARDS.md` §3 for the file-by-file breakdown): routes →
controller → service → Prisma, with a Zod schema file shared between
validation and OpenAPI generation intent.

Modules the MVP does **not** implement (Phase 6+, per `SRS.md` §36.4):
`reviews`, `soundtrack`, `sync`, `notifications`, `ai`. Do not create
these directories until their phase begins.

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

## 8. Future: AI Services (Phase 10 — not built during MVP)

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
- **Not started until Phase 10 begins.** Do not scaffold `ai-service/`
  or add AI-related tables during MVP — see `AGENTS.md` §3 and
  `SRS.md` §36.4.

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
