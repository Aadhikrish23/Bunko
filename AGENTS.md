# AGENTS.md — Instructions for AI Coding Agents

This file is the entry point for any AI agent (Claude Code or similar)
picking up implementation work on Bunko. Read this fully before writing
any code.

## 1. Source of Truth Hierarchy

When documents conflict, resolve in this order:

1. **`docs/SRS.md`** — product requirements. Never contradict this
   without flagging it as a requirement change (see SRS "Requirement
   Change Policy" at the end of that document).
2. **`docs/ARCHITECTURE.md`** and **`docs/DATA_MODEL.md`** — technical
   decisions already made. Don't re-litigate the tech stack in code;
   raise it in a PR description if you believe it's wrong.
3. **`docs/API_SPEC.md`** / **`docs/openapi.yaml`** — the API contract.
   Treat this as binding for request/response shapes.
4. **`docs/TASKS.md`** — the current backlog. Work one ticket at a time.
5. **`docs/CODING_STANDARDS.md`** — how to write the code.

## 2. How to Pick Up a Task

1. Open `docs/TASKS.md` and find the next unchecked ticket in the
   current phase (do not skip ahead to a later phase).
2. Read every SRS section the ticket references before writing code.
3. Confirm the ticket's "Depends on" tickets are already merged.
4. Implement only what the ticket describes. If you discover the
   ticket is too large or missing a dependency, split it or add a new
   ticket to `docs/TASKS.md` rather than silently expanding scope.
5. Follow the branch/commit conventions in `CONTRIBUTING.md`.
6. Do not mark a ticket complete until it satisfies **every** item in
   the Definition of Done (`docs/SRS.md` Appendix B) that applies to it.

## 3. Non-Negotiable Rules

- **Never invent product behaviour not in the SRS.** If a ticket is
  ambiguous, prefer the most conservative reading of the SRS and note
  the assumption in the PR description.
- **Never commit secrets.** Use `.env` (gitignored); update
  `.env.example` (not `.env`) when adding a new required variable.
- **Never weaken auth, validation, or file-upload safety checks** to
  make a test pass. Section 25 (Privacy, Security, Copyright
  Boundaries) and Section 38.3 (EPUB Complexity risk) are hard
  constraints, not suggestions.
- **Never implement out-of-scope features.** SRS §3.2 and §36.4 list
  what is explicitly excluded from MVP (DRM circumvention, book
  piracy/distribution, offline sync, soundtrack, AI, social features).
  Do not scaffold these "for later" — it adds surface area with no
  ticket driving it.
- **All new endpoints must match `docs/openapi.yaml`.** If an endpoint
  needs to change shape, update the spec in the same PR and explain why.
- **All new tables/columns must match `docs/DATA_MODEL.md`.** If the
  schema needs to change, update that doc and generate a Prisma
  migration in the same PR — never hand-edit the database out of band.

## 4. Definition of Done (quick reference)

Full list: `docs/SRS.md` Appendix B. Minimum bar for any PR:

- [ ] Implements the ticket's acceptance criteria exactly
- [ ] Unit tests added/updated and passing
- [ ] Integration tests added where the ticket touches the API or DB
- [ ] Input validation implemented (see `CODING_STANDARDS.md` §Validation)
- [ ] Authorisation checked on every new endpoint (no endpoint is
      public by default)
- [ ] Error, loading, and empty states handled (frontend tickets)
- [ ] No `console.log`/debug output left in
- [ ] Lint and typecheck pass (`npm run lint && npm run typecheck`)
- [ ] Relevant doc updated if behaviour, schema, or API changed

## 5. Commands You Will Need

```bash
# Backend
cd backend
npm run start:dev        # run API locally
npm run test             # unit tests
npm run test:e2e         # integration tests
npm run prisma:migrate   # apply schema changes
npm run lint && npm run typecheck

# Frontend
cd frontend
npm run dev
npm run test
npm run lint && npm run typecheck
```

## 6. When You're Stuck

- Ambiguous requirement → re-read `docs/SRS.md`, pick the most
  conservative interpretation, state the assumption in the PR, and
  keep moving. Do not block on it.
- Missing a dependency ticket → check `docs/TASKS.md` "Depends on"
  field; if genuinely missing, add the smallest possible ticket to
  unblock yourself rather than absorbing it into the current one.
- Conflicting docs → follow the hierarchy in Section 1 and flag the
  conflict in the PR description so a human can reconcile the docs.

## 7. Out of Scope for Any Agent, Any Ticket

Do not implement, and refuse tickets that ask for:

- DRM circumvention or bypassing licensing/format protections
- Downloading, hosting, or distributing copyrighted book content the
  user does not already possess
- Any P2P/torrent functionality

These are excluded in `docs/SRS.md` §3.2 regardless of how a ticket
might phrase the request.
