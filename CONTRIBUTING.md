# Contributing to Bunko

This applies equally to human contributors and AI coding agents.

## Branching

- `main` — always deployable. Protected; no direct commits.
- `feat/<ticket-id>-<short-slug>` — new functionality, e.g.
  `feat/T-014-reading-session-api`
- `fix/<ticket-id>-<short-slug>` — bug fixes
- `chore/<short-slug>` — tooling, deps, docs-only changes

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>

<optional body>

Refs: <ticket-id>
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `perf`, `ci`

Example:

```
feat(reading-sessions): add session start/pause/end state machine

Implements T-018 per docs/TASKS.md. Adds idle-timeout auto-pause per
SRS §12.7-12.8.

Refs: T-018
```

## Pull Requests

Every PR description must include:

1. **Ticket reference** (`Refs: T-XXX`) linking to `docs/TASKS.md`.
2. **What changed** — one or two sentences.
3. **SRS sections implemented** — e.g. "SRS §12.8, §12.10".
4. **Assumptions made**, if the ticket or SRS was ambiguous.
5. **Definition of Done checklist** from `AGENTS.md` §4, checked off.

PRs should be scoped to a single ticket. Do not bundle unrelated
changes.

## Code Review Checklist

- Does it match `docs/API_SPEC.md` / `docs/DATA_MODEL.md` exactly?
- Is every new endpoint authorised (not just authenticated)?
- Are errors handled per `docs/CODING_STANDARDS.md` §Error Handling?
- Are tests meaningful (not just coverage padding)?
- Does it avoid scope creep into a later MVP phase (SRS §36.2)?

## Documentation Changes

If a change affects behaviour, schema, or API shape, update the
relevant doc **in the same PR**:

- Schema change → `docs/DATA_MODEL.md` + Prisma migration
- API change → `docs/openapi.yaml` + `docs/API_SPEC.md`
- Requirement change → follow the Requirement Change Policy in
  `docs/SRS.md`

Documentation-only PRs are welcome and do not need a ticket.
