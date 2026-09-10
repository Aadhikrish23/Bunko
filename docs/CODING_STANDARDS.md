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

## 3. Backend Structure (Express)

Each module (`ARCHITECTURE.md` §3) follows the same four-file shape —
no framework DI container, so the wiring is explicit in `routes.ts`:

```
reading-sessions/
├── reading-sessions.routes.ts       # Express Router; wires middleware -> controller
├── reading-sessions.controller.ts   # req/res handling only
├── reading-sessions.service.ts      # business logic; only layer that touches Prisma
├── reading-sessions.schema.ts       # Zod schemas (request/response), mirrors openapi.yaml
└── reading-sessions.test.ts         # Playwright API tests (see TESTING_STRATEGY.md)
```

- `*.routes.ts` is the only place middleware order is decided:
  `router.post('/', authMiddleware, validate(startSessionSchema), controller.start)`.
  Reading a routes file top-to-bottom must show the full request
  pipeline with nothing hidden.
- Controllers: parse `req`, call the service, shape the response
  envelope (`API_SPEC.md` §3), call `next(err)` on failure. No business
  logic here.
- Services own business logic and are the only layer that talks to
  Prisma. Services never touch `req`/`res` directly — this keeps them
  unit-testable without spinning up Express.
- One Zod schema per request/response shape, named to match
  `openapi.yaml` operation IDs. If a schema and the OpenAPI spec
  diverge, one of the two is wrong — fix it in the same PR.

## 4. Validation

- Every request body/params/query validated via a Zod schema, applied
  through the shared `validate(schema)` middleware
  (`middleware/validate.ts`) *before* the controller runs. Unknown
  fields are stripped or rejected (`.strict()` on the Zod object) —
  never silently accepted.
- Never trust client-reported file MIME type — verify by inspecting
  file content server-side (SRS §38.2/§38.3, `SECURITY.md`).
- Path/query params that reference a resource ID are validated as
  UUIDs by the same Zod schema before the controller runs, never
  inline in the controller body.

## 5. Error Handling

- Handlers never send error responses directly. They call
  `next(new AppError(code, message, statusCode))` (or let a thrown
  error propagate) and let the single global `errorHandler` middleware
  (`middleware/error-handler.ts`, registered last in `app.ts`) format
  the response envelope using the codes in `API_SPEC.md` §4. This is
  the one place error-response shaping happens — never format an error
  response inline in a controller.
- The global handler never leaks raw stack traces or Prisma error
  messages to the client in any environment reachable by real users.
- Every caught error is logged with a `requestId` for correlation
  (see observability notes in SRS §32).
- Distinguish "not found" from "not yours": both return 404 (never
  reveal existence of another user's resource via a 403).

## 6. Authorization

- `authMiddleware` (`middleware/auth.ts`) verifies the JWT and sets
  `req.user = { id, email }`. Every controller for user-owned data
  reads `req.user.id` — never a client-supplied `userId` field in the
  body/query, even if one happens to be present.
- Route files apply `authMiddleware` explicitly on every route that
  needs it (there is no global "guard" applied by a framework) — this
  is why route files must be read top-to-bottom in review; a missing
  `authMiddleware` on a route is the single most important thing a
  reviewer checks.
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

- New service method → Playwright API test (`request` fixture, no
  browser) covering the happy path and at least one failure/edge case.
- New endpoint → Playwright API test covering auth-required,
  validation-failure, and success cases.
- New non-trivial frontend flow → Playwright browser test covering the
  user-visible behaviour, not implementation detail.

## 9. Comments

- Comment *why*, not *what*. Code should be readable without
  comments explaining mechanics.
- Reference the SRS section a non-obvious business rule comes from,
  e.g. `// Idle timeout per SRS §12.8 step 4 (default 5 min)`.

## 10. Formatting

- Prettier (default config, no custom overrides) + ESLint
  (`@typescript-eslint/recommended` + `eslint-plugin-react` for the
  frontend).
- Run `npm run lint && npm run typecheck` before opening a PR — CI
  will reject otherwise.
