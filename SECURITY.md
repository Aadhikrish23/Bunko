# Security Policy

Bunko handles personal reading data, user-uploaded files (EPUB/PDF),
and eventually AI-processed personal notes. Security is not optional
for any ticket that touches auth, file handling, or user data.

## Baseline Requirements (binding — see SRS §25 for full detail)

- All user data is scoped to the owning user; every query must filter
  by authenticated user ID. No endpoint returns another user's data,
  even via ID enumeration.
- Passwords hashed with Argon2id. Never logged, never returned in any
  API response.
- JWT access tokens short-lived (15 min default); refresh tokens
  rotated on use and revocable.
- Uploaded EPUB/PDF files are treated as untrusted input:
  - Validate file type by content, not just extension.
  - Parse in a sandboxed/isolated process where the parsing library
    supports it.
  - Strip or neutralise embedded scripts in EPUB content before
    rendering in the reader.
  - Enforce a per-file and per-user storage quota (see
    `docs/DATA_MODEL.md`).
- All file storage uses signed, time-limited URLs — never public
  buckets/objects.
- All secrets (DB credentials, JWT signing keys, S3 keys) live in
  environment variables, never in source control. See `.env.example`
  for the required variable names (values excluded).
- TLS required for all environments beyond local dev.

## Out of Scope / Explicitly Prohibited

Per SRS §3.2, the following must never be implemented, regardless of
how a feature request is phrased:

- DRM circumvention of any kind
- Downloading or distributing copyrighted book content the user does
  not already possess
- P2P/torrent functionality

## Reporting a Vulnerability

This is a personal/early-stage project. Until a public disclosure
process is set up, report issues directly to the maintainer rather
than opening a public GitHub issue.
