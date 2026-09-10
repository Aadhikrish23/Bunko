# Bunko — API Conventions

This document covers cross-cutting API conventions. For exact endpoint
contracts (request/response schemas), see `docs/openapi.yaml` — that
file is binding; this document explains the rules behind it.

The same spec is also served interactively at `GET /api/docs` (Swagger
UI) once the backend is running — see `docs/ARCHITECTURE.md` §7.

## 1. Base URL & Versioning

All endpoints are prefixed `/api/v1`. Breaking changes require a new
version prefix (`/api/v2`); never break `/v1` in place.

## 2. Authentication

- All endpoints except `POST /auth/register`, `POST /auth/login`, and
  `POST /auth/refresh` require `Authorization: Bearer <accessToken>`.
- Access tokens expire in 15 minutes. Clients use the refresh token
  (httpOnly cookie) to obtain a new one via `POST /auth/refresh`.
- Every authorised endpoint scopes its query to the authenticated
  user's own data. There is no "admin" role in MVP.

## 3. Standard Response Envelope

Success:

```json
{
  "data": { ... },
  "meta": { "requestId": "..." }
}
```

Paginated list:

```json
{
  "data": [ ... ],
  "meta": { "requestId": "...", "page": 1, "pageSize": 20, "total": 143 }
}
```

Error:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable summary",
    "details": [ { "field": "email", "issue": "must be a valid email" } ]
  },
  "meta": { "requestId": "..." }
}
```

## 4. Error Codes (minimum set)

| HTTP Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Request body/params failed validation |
| 401 | `UNAUTHENTICATED` | Missing/invalid/expired token |
| 403 | `FORBIDDEN` | Authenticated but not authorised for this resource |
| 404 | `NOT_FOUND` | Resource doesn't exist or isn't owned by the caller |
| 409 | `CONFLICT` | e.g. duplicate shelf name, session already active |
| 413 | `FILE_TOO_LARGE` | Upload exceeds size limit or user quota |
| 422 | `UNSUPPORTED_FILE` | File fails type/content validation (SRS §38.2/§38.3) |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Unhandled server error |

## 5. Pagination

Cursor-free offset pagination for MVP (`page`, `pageSize`, default 20,
max 100). Revisit if library sizes in practice make this too slow.

## 6. Idempotency

`POST /reading-sessions/:id/end` and other state-transition endpoints
must be idempotent — calling twice with the same session in `ENDED`
state returns the existing result, not a `CONFLICT`, unless the payload
materially differs (e.g. a different `endPosition`).

## 7. File Uploads

Uploads are two-step to keep large binaries off the API server:

1. `POST /files/upload-url` → returns a signed S3 PUT URL + `fileId`.
2. Client uploads the binary directly to S3.
3. `POST /files/:fileId/confirm` → server validates content-type/size
   server-side (never trusts the client-reported type), runs the
   validation pipeline (SRS §38.2/§38.3), and attaches it to a `Copy`.

## 8. MVP Endpoint Groups

See `docs/openapi.yaml` for full schemas. Groups, mapped to SRS
sections and backend modules (`ARCHITECTURE.md` §2):

| Group | Base Path | SRS Ref |
|---|---|---|
| Auth | `/auth` | §23 |
| Library | `/works`, `/shelves` | §15, §16 |
| Editions & Copies | `/editions`, `/copies` | §16 |
| Files | `/files` | §24 |
| Reader | `/editions/:id/reader-manifest` | §10 |
| Continuity | `/reading-journeys/:id/resolve-position` | §11 |
| Reading Sessions | `/reading-sessions` | §12 |
| Journal | `/journal` | §12.5 |
