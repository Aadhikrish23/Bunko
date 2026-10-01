# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Individual readers who want one place to manage both their physical and digital books. Bunko is a multi-user product: each person has their own account and a private library, notes, highlights, sessions, and journal that no one else can see (SRS §5.1, §23.4). The primary situational need is tracking and continuing a single reading journey for a work regardless of which copy — a physical book or an EPUB/PDF — the reader happens to have in hand at a given moment.

## Product Purpose

> "Bunko is a personal archive of a reader's relationship with books." (SRS §2.1)

It goes beyond "which books have I read" to preserve what a reader read, how they read it, what they thought about it, what they remembered, and how their reading life evolved — a personal library, an in-app reader for user-provided EPUB/PDF files, a reading journal, and notes/highlights/quotes tied to specific reading locations (SRS §1.2, §2.1).

## Positioning

Bunko's mechanism a simple book tracker or a standalone ebook reader can't truthfully copy: **one logical reading journey across physical and digital editions of the same work** (SRS §2.1, §6.1, §11). A reader can own a paperback and later continue in an EPUB (or the reverse) and Bunko maps their position across formats instead of starting a second, disconnected progress record. The SRS calls this the product's central hypothesis — the MVP (Phases 1-5) is scoped specifically around proving this continuity, not around tracking or reading in isolation (SRS §36.1).

## Operating Context

- Readers add books as physical copies, imported digital files (EPUB/PDF), or both, under one `Work`/`Edition`/`Copy` model (SRS §16, §27).
- Digital reading happens in-app, in a unified "flow reader" that reflows extracted chapter text (serif/sans/mono, adjustable line-height/margins/theme/page-turn mode) rather than two separate format-specific viewers.
- Reading sessions are recorded automatically where possible and are always correctable by the reader (SRS §6.2, §6.3); sessions accumulate into a chronological journal.
- Notes, highlights, and quotes attach to a specific book and reading location, not just the book as a whole.
- Shelves/collections, search, and reading statistics sit on top of the same library and journey data.
- Soundtrack/atmosphere, offline sync, and the AI insights layer are named in the vision but are explicitly deferred past MVP (SRS §36.2, Phases 8-10) — they are roadmap, not current operating context.

## Capabilities and Constraints

- Digital import is limited to files the user already possesses (EPUB/PDF); Bunko is not a marketplace, does not sell or distribute books, and will not implement DRM circumvention, unauthorized downloading, or P2P/torrent functionality under any circumstances (SRS §3.2 — hard boundary, not a priority call).
- Authentication is per-account with server-side object-level authorization on every private resource; no admin has unrestricted access to a user's private reading content without an explicit support/security process (SRS §5.2, §23.4).
- MVP (Phases 1-5: foundation, book management, reading tracking, digital reading, unified physical/digital continuity) is implemented. Some Phase 6 fast-follow surface (in-reader highlights/notes/bookmarks, in-book search) is already built ahead of strict MVP scope. Soundtrack, offline/sync, and the AI layer remain future (v2+) and are out of current scope (SRS §36.2).
- Undecided: whether/when multi-user features beyond private-by-default accounts (e.g. any shared or social surface) are ever built — SRS §3.2 excludes social networking as a core requirement, and no sharing has been requested.

## Brand Commitments

- Name: **Bunko**.
- Tagline (live in the app today): "One Book. Multiple Formats. One Reading Journey."
- Framing on sign-up: "Bunko is free to use for your own books."

## Evidence on Hand

None. No real testimonials, case studies, press, or sample reading history exist yet — this is a working product with a live account base of one developer/user so far. Future design and copy work must not fabricate reviews, user counts, or usage data.

## Product Principles

1. **One Book, One Reading Journey** — different editions/formats of the same work feed one logical history wherever mapping is reliable (SRS §6.1).
2. **Automatic where possible, manual override always available** — infer reading state from behavior when it's safe to, but the reader can always correct it (SRS §6.2, §6.3).
3. **User-owned, private by default** — notes, quotes, reviews, reading history, and preferences are personal data and are treated as such; administrators don't get unrestricted access (SRS §6.4, §5.2).
4. **Reading first** — the reading experience stays simple and distraction-free; features orbit it rather than compete with it (SRS §6.5).
5. **AI is an enhancement, never the product** — any future AI layer uses Bunko's structured reading data to add insight, not to replace the core library/reading functionality (SRS §6.6).

## Accessibility & Inclusion

Required standard (SRS §31): keyboard navigation, screen-reader support, semantic controls, sufficient contrast, scalable text, accessible focus states and forms, alt text for meaningful images, and respect for reduced-motion preferences. The digital reader should additionally support the accessibility capabilities of the underlying browser/platform where possible.
