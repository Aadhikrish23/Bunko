# Bunko — Architecture

This document translates the logical architecture in `SRS.md` §7 into
concrete technical decisions. The SRS is intentionally
technology-agnostic; this document is not — it is the binding
implementation choice for MVP (Phases 1-5).

## 1. Stack Summary

| Layer | Choice | Why |
|---|---|---|
| Backend language/runtime | TypeScript / Node.js 20 | Single language across backend and frontend; strong ecosystem for EPUB/PDF parsing. |
| Backend framework | NestJS | Opinionated module structure maps cleanly onto SRS §7 service boundaries; built-in DI, guards (auth), pipes (validation). |
| Database | PostgreSQL 16 | Relational integrity fits the SRS §27 entity graph (User → Work → Edition → Copy, etc.); mature, well-supported. |
| ORM | Prisma | Type-safe schema-as-code, migration tooling, good fit for agent-driven schema changes. |
| Cache / job queue | Redis + BullMQ | Background jobs (EPUB indexing, thumbnail generation, future notifications) need a queue; Redis doubles as cache. |
| Object storage | S3-compatible (AWS S3 prod, MinIO local) | Digital book files and cover images must not live in the app DB or filesystem (SRS §24). |
| Frontend framework | React 18 + TypeScript + Vite | MVP targets web first (see §5); fast dev loop, large ecosystem for EPUB/PDF rendering libraries. |
| Frontend data layer | TanStack Query | Server-state caching/sync fits a read-heavy library/reader app. |
| Styling | Tailwind CSS | Fast to build a calm, book-centric UI (SRS §2.3) without a heavy design-system dependency. |
| EPUB rendering | epub.js | De facto standard for in-browser EPUB rendering with location/CFI support needed for SRS §11 mapping. |
| PDF rendering | pdf.js | Mozilla's PDF renderer; needed for SRS §10 reader and §11.6 page-fallback indexing. |
| Auth | JWT (access + refresh) via NestJS Passport | Stateless API auth; refresh rotation for security (see `SECURITY.md`). |
| CI | GitHub Actions | Lint, typecheck, test on every PR (see `.github/workflows/ci.yml`). |
| Local dev orchestration | Docker Compose | Postgres, Redis, MinIO spun up identically for every contributor/agent. |

This stack is a recommendation formed in the absence of an
SRS-mandated stack. Changing it after Phase 1 begins is a requirement
change (see `SRS.md` Requirement Change Policy).

## 2. Service Boundaries (maps to SRS §7)

Implemented as NestJS modules within a single backend app for MVP
(modular monolith, not microservices — see §4 rationale):

```
backend/src/
├── auth/              # FR-001, FR-002 — registration, login, JWT
├── users/             # user profile, account settings
├── library/           # books/works, authors, series
├── editions/          # editions, copies, digital files
├── files/             # upload, storage, signed URLs (SRS §24)
├── reader/            # EPUB/PDF parsing, indexing (SRS §10, §11.6)
├── continuity/        # cross-edition mapping engine (SRS §11.7-11.9)
├── reading-sessions/  # session lifecycle (SRS §12)
├── journal/           # chronological journal view (SRS §12.5)
├── annotations/       # notes/highlights/quotes — Phase 6, stubbed only
├── shelves/           # shelves, tags, collections (SRS §15)
├── search/            # library search/filter (SRS §18)
└── common/            # guards, pipes, interceptors, shared DTOs
```

Modules the MVP does **not** implement (Phase 6+, per `SRS.md` §36.4):
`reviews`, `soundtrack`, `sync`, `notifications`, `ai`. Do not create
these directories until their phase begins.

## 3. Request Flow (example: opening a digital book)

```
Client (React Reader)
   |
   | GET /editions/:id/reader-manifest
   v
NestJS AuthGuard  ->  verifies JWT, attaches user
   |
ReaderController  ->  ReaderService
   |
   +-- FilesService --> S3: signed URL for EPUB/PDF blob
   +-- ContinuityService --> resolve last reading position (SRS §11)
   +-- ReadingSessionsService --> auto-start session (SRS §12.8)
   |
   v
Response: { fileUrl, startPosition, sessionId }
   |
   v
Client: epub.js/pdf.js loads file, navigates to startPosition,
        begins reporting position updates every N seconds
```

## 4. Why a Modular Monolith (Not Microservices) for MVP

SRS §7 lists many logical services (auth, library, reading, journal,
annotation, file, search, sync, notification, music, AI). Standing
these up as separate deployable services before a single user exists
would violate the complexity risk flagged in `SRS.md` §38.7. A modular
monolith with clean module boundaries (above) gives the same logical
separation and can be split into real services later if a specific
module (e.g. AI, §Phase 10) needs independent scaling.

## 5. Client Strategy

MVP ships a responsive web client only. A native mobile client is
out of MVP scope (not listed in `SRS.md` §36 Phases 1-5) but the
API-first design (all functionality behind versioned REST endpoints,
no server-rendered views) means a React Native or native client can
be added later without backend changes.

## 6. Folder Structure (top level)

```
bunko/
├── backend/
│   ├── src/            # see §2 above
│   ├── prisma/         # schema.prisma, migrations/
│   └── test/           # e2e tests
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── features/   # one folder per domain area, mirrors backend modules
│   │   └── lib/         # api client, query hooks
│   └── e2e/             # Playwright tests
├── docs/
└── .github/workflows/
```

## 7. Environments

| Env | Purpose | Notes |
|---|---|---|
| `local` | Agent/developer machine | Docker Compose: Postgres, Redis, MinIO |
| `staging` | Pre-production validation | Mirrors prod config, seeded test data |
| `production` | Live | See `SRS.md` §34 for full deployment requirements |

Deployment target (containers on a managed platform, e.g. AWS
ECS/Fargate or Fly.io) is left open per SRS §34 flexibility; CI builds
a container image regardless of final hosting choice.
