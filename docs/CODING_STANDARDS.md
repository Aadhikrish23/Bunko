# Bunko — Coding Standards

Binding conventions for all code, human- or agent-written. Consistency
matters more than personal preference here since multiple agents will
touch this codebase over time.

## 1. General

- TypeScript strict mode everywhere (`"strict": true`). No `any`
  without a `// eslint-disable-next-line` comment explaining why.
- Prefer named exports over default exports (easier for agents to
  grep/refactor reliably).
- No dead code, commented-out code, or TODOs without a linked ticket
  ID (`// TODO(T-042): ...`).

## 2. Naming

- Files: `kebab-case.ts` (`reading-sessions.service.ts`)
- Classes/Interfaces/Types: `PascalCase`
- Variables/functions: `camelCase`
- Constants that are truly fixed: `UPPER_SNAKE_CASE`
- Database tables/columns: match the Prisma schema exactly
  (`camelCase` fields, Prisma maps to `snake_case` columns
  automatically — do not fight this).
- Booleans read as a question: `isActive`, `hasQuota`, not `active`,
  `quota`.

## 3. Backend Structure (NestJS)

Each module (`ARCHITECTURE.md` §2) follows:

```
reading-sessions/
├── reading-sessions.module.ts
├── reading-sessions.controller.ts
├── reading-sessions.service.ts
├── dto/
│   ├── start-session.dto.ts
│   └── end-session.dto.ts
└── reading-sessions.service.spec.ts
```

- Controllers only: route, validate (via DTO + `class-validator`),
  delegate to service, shape response envelope. No business logic in
  controllers.
- Services own business logic and are the only layer that talks to
  Prisma.
- One DTO per request/response shape; DTOs mirror `openapi.yaml`
  exactly. If they diverge, one of the two is wrong — fix it.

## 4. Validation

- Every request body validated via `class-validator` DTOs at the
  controller boundary. Reject unknown fields (`forbidNonWhitelisted:
  true`).
- Never trust client-reported file MIME type — verify by inspecting
  file content server-side (SRS §38.2/§38.3, `SECURITY.md`).
- Path/query params that reference a resource ID must be validated as
  UUIDs before hitting the database.

## 5. Error Handling

- Throw NestJS `HttpException` subclasses with the error codes defined
  in `API_SPEC.md` §4 — never leak raw stack traces or Prisma error
  messages to the client.
- Every caught error is logged with a `requestId` for correlation
  (see `docs/TESTING_STRATEGY.md` / observability notes in SRS §32).
- Distinguish "not found" from "not yours": both return 404 (never
  reveal existence of another user's resource via a 403).

## 6. Authorization

- Every controller method that touches user-owned data must derive
  the user ID from the authenticated JWT (`@CurrentUser()` decorator),
  never from a client-supplied field in the body/query.
- Ownership checks happen in the service layer via the Prisma query's
  `where` clause (`where: { id, userId }`), not as a separate
  after-the-fact check.

## 7. Frontend (React)

- Function components + hooks only. No class components.
- One feature folder per domain area (`features/reading-sessions/`),
  mirroring backend module names for easy cross-reference.
- All server communication goes through TanStack Query hooks in
  `lib/api/`, generated/typed from `openapi.yaml` where practical.
  Components never call `fetch` directly.
- Every data-fetching component handles three states explicitly:
  loading, error, empty. No bare `data.map(...)` without a guard.

## 8. Testing Expectations

See `docs/TESTING_STRATEGY.md` for the full strategy. Minimum per PR:

- New service method → unit test covering the happy path and at least
  one failure/edge case.
- New endpoint → integration (e2e) test covering auth-required,
  validation-failure, and success cases.
- New reducer/complex component logic → component test.

## 9. Comments

- Comment *why*, not *what*. Code should be readable without
  comments explaining mechanics.
- Reference the SRS section a non-obvious business rule comes from,
  e.g. `// Idle timeout per SRS §12.8 step 4 (default 5 min)`.

## 10. Formatting

- Prettier (default config, no custom overrides) + ESLint
  (`@typescript-eslint/recommended` + NestJS/React plugin presets).
- Run `npm run lint && npm run typecheck` before opening a PR — CI
  will reject otherwise.
