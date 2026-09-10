# Bunko — Personal Digital & Physical Reading Library

Bunko is a personal reading platform that unifies physical and digital
books into one continuous reading journey — tracking progress, sessions,
notes, quotes, and reviews across formats.

> **One Book. Multiple Formats. One Reading Journey.**

This repository is structured for implementation by AI coding agents
(e.g. Claude Code) working from a fixed set of specification and
engineering documents. **Start with [`AGENTS.md`](./AGENTS.md)** if you
are an agent picking up work here.

## Documentation Map

| Document | Purpose |
|---|---|
| [`docs/SRS.md`](./docs/SRS.md) | Canonical product requirements. Source of truth for *what* to build. |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Tech stack, service boundaries, folder structure. Source of truth for *how* it's built. |
| [`docs/DATA_MODEL.md`](./docs/DATA_MODEL.md) | Database schema derived from SRS §27. |
| [`docs/API_SPEC.md`](./docs/API_SPEC.md) + [`docs/openapi.yaml`](./docs/openapi.yaml) | REST API contract for MVP endpoints. |
| [`docs/CODING_STANDARDS.md`](./docs/CODING_STANDARDS.md) | Conventions all generated code must follow. |
| [`docs/TESTING_STRATEGY.md`](./docs/TESTING_STRATEGY.md) | What must be tested and how. |
| [`docs/TASKS.md`](./docs/TASKS.md) | MVP backlog broken into agent-sized tickets. |
| [`AGENTS.md`](./AGENTS.md) | Operating instructions for AI coding agents working in this repo. |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Branching, commits, PR process (applies to human and agent contributors alike). |
| [`SECURITY.md`](./SECURITY.md) | Security requirements and disclosure policy. |

## Tech Stack (MVP)

- **Backend:** Node.js 20, TypeScript, Express, PostgreSQL 16, Prisma ORM, Redis (cache + jobs), S3-compatible object storage
- **API Docs:** OpenAPI 3.0 (`docs/openapi.yaml`), served interactively via Swagger UI at `/api/docs`
- **Frontend:** React 18, TypeScript, Vite, TanStack Query, Tailwind CSS, epub.js, pdf.js
- **Testing:** Playwright (both API/integration tests and browser E2E — one framework end to end)
- **Auth:** JWT access/refresh tokens, Argon2 password hashing
- **Infra:** Docker Compose (local dev), GitHub Actions (CI)
- **AI Services (Phase 10, future):** Python 3.12, FastAPI — a separate service, not part of MVP. See `docs/ARCHITECTURE.md` §8.

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for rationale and details.

## Getting Started (local dev)

```bash
git clone <this-repo-url>
cd bunko
cp .env.example .env          # fill in local secrets
docker compose up -d          # postgres, redis, minio
cd backend && npm install && npm run prisma:migrate && npm run dev
cd ../frontend && npm install && npm run dev
```

## Project Status

Baseline documentation complete. Implementation follows the phased plan
in `docs/SRS.md` §36 and the ticket backlog in `docs/TASKS.md`, starting
with MVP Phase 1 (Foundation).

## License

Not yet decided. Do not treat this repository as open for redistribution
until a `LICENSE` file is added.
