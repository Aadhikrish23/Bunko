# Bunko — Data Model

Formalises `SRS.md` §27 (Data Model) into a concrete schema for MVP
(Phases 1-5). This is the binding schema — implement via Prisma
migrations, never hand-edit the database.

## 1. Entity Overview (MVP scope only)

Entities below cover Phases 1-5. `Note` exists in MVP as a simple
free-text field on `ReadingSession` (SRS §12.2) — the full annotation
subsystem (`Highlight`, `Quote`, standalone `Note` with location
anchoring) is Phase 6 and intentionally excluded here.

## 2. Prisma Schema (MVP)

```prisma
// backend/prisma/schema.prisma

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  displayName  String
  // The jti of the most recently issued refresh token, for rotation
  // (SRS §23.2, added during T-008). MVP tracks a single active session
  // per user — a real multi-device model is DeviceSession (Phase 9, §5).
  currentRefreshTokenId String?
  // The jti rotation replaced, kept for a short grace window (round 5
  // QA, R5-06) so two requests racing on the same now-superseded token
  // don't sign the reader out.
  previousRefreshTokenId        String?
  previousRefreshTokenExpiresAt DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  works           UserWork[]
  shelves         Shelf[]
  readingJourneys ReadingJourney[]
  copies          Copy[]
  sessions        ReadingSession[]
}

model Author {
  id    String @id @default(uuid())
  name  String
  works WorkAuthor[]
}

model Series {
  id    String @id @default(uuid())
  name  String
  works Work[]
}

// "Work" = abstract literary work (SRS §4 "Work")
model Work {
  id             String   @id @default(uuid())
  title          String
  seriesId       String?
  series         Series?  @relation(fields: [seriesId], references: [id])
  description    String?
  genres         String[] // simple string array for MVP; normalise later if needed
  coverImageUrl  String?
  originalLanguage String?
  language         String?
  partsCount       Int?
  chaptersCount    Int?
  externalSource String?  // e.g. "open-library"; null if manually entered
  externalId     String?  // e.g. Open Library work key ("OL45804W")
  createdAt      DateTime @default(now())

  authors  WorkAuthor[]
  editions Edition[]
  users    UserWork[]

  @@unique([externalSource, externalId])
}

model WorkAuthor {
  workId   String
  authorId String
  work     Work   @relation(fields: [workId], references: [id])
  author   Author @relation(fields: [authorId], references: [id])

  @@id([workId, authorId])
}

// A user's relationship to a Work (library membership) — SRS §15
//
// Correction (found during T-003 implementation): uses a synthetic `id`
// rather than a composite [userId, workId] primary key, because
// ShelfWork needs a single-column foreign key to this table, and Prisma
// relations can only target a model's own scalar field(s) — a composite
// primary key would require ShelfWork to carry both columns itself.
// `@@unique([userId, workId])` still enforces one row per user/work pair.
model UserWork {
  id        String   @id @default(uuid())
  userId    String
  workId    String
  user      User     @relation(fields: [userId], references: [id])
  work      Work     @relation(fields: [workId], references: [id])
  status    ReadingStatus @default(WANT_TO_READ)
  addedAt   DateTime @default(now())
  // When the status last became FINISHED (SRS §18.2 completion date);
  // cleared when it changes to anything else. Backfilled for books already
  // Finished from their last reading session (T-105, R2-20).
  finishedAt DateTime?

  shelves ShelfWork[]

  @@unique([userId, workId])
}

enum ReadingStatus {
  WANT_TO_READ
  READING
  FINISHED
  DID_NOT_FINISH
}

// A user's rating/review of a Work — SRS §14 (Phase 7, T-050). One per
// (userId, workId); re-rating/re-reviewing is an upsert via T-051's
// create-or-replace API, not a second row.
model Review {
  id              String   @id @default(uuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id])
  workId          String
  work            Work     @relation(fields: [workId], references: [id])
  rating          Int? // 1-5 when set; nullable — SRS §14 lists rate/review/favourite/reread as independent actions
  body            String?
  isFavourite     Boolean  @default(false)
  rereadIntention Boolean  @default(false)
  metadata        Json? // open bucket for SRS §14's "other structured metadata" (e.g. favourite character)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([userId, workId])
}

// A specific published version of a Work — SRS §4 "Edition"
model Edition {
  id           String   @id @default(uuid())
  workId       String
  work         Work     @relation(fields: [workId], references: [id])
  publisher    String?
  language     String?
  format       EditionFormat
  isbn         String?
  pageCount    Int?      // best-effort, used only as fallback (SRS §11.6)
  chapterGraph Json?     // structural index built at import time (SRS §11.6)
  createdAt    DateTime  @default(now())

  copies Copy[]
}

enum EditionFormat {
  PHYSICAL
  EPUB
  PDF
}

// A user's instance of an Edition — SRS §4 "Copy"
model Copy {
  id           String   @id @default(uuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id])
  editionId    String
  edition      Edition  @relation(fields: [editionId], references: [id])
  digitalFileId String? @unique
  digitalFile  DigitalFile? @relation(fields: [digitalFileId], references: [id])
  acquiredAt   DateTime @default(now())

  sessions ReadingSession[]
}

model DigitalFile {
  id            String   @id @default(uuid())
  storageKey    String   // S3 object key, never a public URL
  originalName  String
  mimeType      String
  sizeBytes     Int
  checksum      String   // for dedup / integrity check
  uploadedAt    DateTime @default(now())

  copy Copy?
}

// Cumulative progress/history for a Work — SRS §4 "Reading Journey"
model ReadingJourney {
  id         String   @id @default(uuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  workId     String
  canonicalPositionId String? @unique
  canonicalPosition   ReadingPosition? @relation(fields: [canonicalPositionId], references: [id])
  createdAt  DateTime @default(now())

  sessions ReadingSession[]

  @@unique([userId, workId])
}

// The canonical, edition-independent position — SRS §11.2
model ReadingPosition {
  id             String   @id @default(uuid())
  structuralId   String?  // stable chapter/section id, if known
  chapterLabel   String?  // human-readable, e.g. "Chapter 10"
  textAnchor     String?  // n-gram fingerprint reference (SRS §11.6)
  pageNumber     Int?     // fallback only
  confidence     Float?   // 0.0-1.0, per SRS §11.8
  updatedAt      DateTime @updatedAt

  journey ReadingJourney?
}

// SRS §12 — full session lifecycle
model ReadingSession {
  id               String   @id @default(uuid())
  userId           String
  user             User     @relation(fields: [userId], references: [id])
  journeyId        String
  journey          ReadingJourney @relation(fields: [journeyId], references: [id])
  copyId           String
  copy             Copy     @relation(fields: [copyId], references: [id])

  status           SessionStatus @default(ACTIVE)
  medium           EditionFormat // PHYSICAL | EPUB | PDF, denormalised from Copy.edition for fast queries
  startTime        DateTime @default(now())
  endTime          DateTime?
  durationSeconds  Int?
  startPosition    String?  // structuralId or page, format depends on medium
  endPosition      String?
  reflection       String?  // free-text, optional (SRS §12.10)
  device           String?
  // Time away from the book isn't reading time (SRS §12.8). pausedAt marks
  // the start of the current pause; pausedSeconds sums finished pauses and
  // is subtracted from durationSeconds (T-105, R2-06).
  pausedAt         DateTime?
  pausedSeconds    Int      @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId, startTime])
}

enum SessionStatus {
  ACTIVE
  PAUSED
  ENDED
}

// SRS §13.2/§13.3 — a Highlight and a Quote share nearly every field
// (selected text, location, chapter/position, creation time); `kind`
// is the one thing that actually differs in how they're used, so one
// table with a discriminator avoids duplicating the other nine. Not a
// standalone Note (below) — always anchored to a text selection
// inside one specific copy.
model Annotation {
  id        String          @id @default(uuid())
  userId    String
  user      User            @relation(fields: [userId], references: [id])
  copyId    String
  copy      Copy            @relation(fields: [copyId], references: [id])
  sessionId String?
  session   ReadingSession? @relation(fields: [sessionId], references: [id])

  kind     AnnotationKind
  position String // structuralId/CFI/page — format depends on medium, same convention as ReadingSession.startPosition
  text     String // exact selected source text (SRS §13.4)
  color    String? // highlight colour/category (§13.2); quotes may omit
  note     String? // margin note (highlight) / comment (quote) — §13.2/§13.3 name these differently, same field
  tags     String[] // quote tags (§13.3); empty for highlights

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId, copyId])
  @@index([sessionId])
}

enum AnnotationKind {
  HIGHLIGHT
  QUOTE
}

// SRS §13.1 — a standalone note, NOT anchored to a text selection
// (that's Annotation above). Scope decides what's required: BOOK and
// SESSION notes have no position; CHAPTER/SECTION/PAGE/PASSAGE do.
// workId is always set (even a SESSION-scoped note is about a work),
// so "my notes on this book" works regardless of edition.
model Note {
  id        String          @id @default(uuid())
  userId    String
  user      User            @relation(fields: [userId], references: [id])
  workId    String
  work      Work            @relation(fields: [workId], references: [id])
  copyId    String? // set for CHAPTER/SECTION/PAGE/PASSAGE; null for BOOK/SESSION
  copy      Copy?           @relation(fields: [copyId], references: [id])
  sessionId String?
  session   ReadingSession? @relation(fields: [sessionId], references: [id])

  scope    NoteScope
  position String? // null for BOOK/SESSION scope; structuralId/page for the others
  body     String

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId, workId])
  @@index([sessionId])
}

enum NoteScope {
  BOOK
  CHAPTER
  SECTION
  PAGE
  PASSAGE
  SESSION
}

// SRS §15 — Shelves/collections
model Shelf {
  id     String @id @default(uuid())
  userId String
  user   User   @relation(fields: [userId], references: [id])
  name   String

  works ShelfWork[]

  @@unique([userId, name])
}

model ShelfWork {
  shelfId    String
  userWorkId String
  shelf      Shelf    @relation(fields: [shelfId], references: [id])
  userWork   UserWork @relation(fields: [userWorkId], references: [id])

  @@id([shelfId, userWorkId])
}

// A reader's custom drag-reorder of one Shelves view, so it follows the
// account across devices instead of staying stuck in one browser's
// localStorage (SRS §15 UX expectation; added when the original
// localStorage-only implementation was found to silently not sync).
// tabKey is the same opaque client-chosen key the Shelves UI already
// uses for a view ("all", "status:READING", "shelf:<uuid>") — not every
// key maps to a real Shelf row, since the status-based views are
// computed client-side, not stored entities.
model ShelfArrangement {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  tabKey    String
  workIds   String[]
  updatedAt DateTime @updatedAt

  @@unique([userId, tabKey])
}

// SRS §17 — one of a user's playlists (Phase 8, T-059). Only a link to
// the provider's own content: Bunko never stores or proxies audio
// (§17.6). The embed URL is derived from `url` by the T-058 parser, not
// stored, so a parser fix applies to every existing row.
model Soundtrack {
  id        String             @id @default(uuid())
  userId    String
  user      User               @relation(fields: [userId], references: [id])
  name      String
  url       String
  provider  SoundtrackProvider
  createdAt DateTime           @default(now())
  updatedAt DateTime           @updatedAt

  mappings SoundtrackMapping[]

  @@index([userId])
}

enum SoundtrackProvider {
  SPOTIFY
  YOUTUBE
  APPLE_MUSIC
  SOUNDCLOUD
}

// What a soundtrack is associated with (§17.2, §17.3) — one playlist per
// target. `targetKey` is a workId/shelfId for WORK/SHELF, or a
// normalised (trimmed, lowercased) label for GENRE/MOOD/SITUATION. It's
// polymorphic, so there's no FK: deleteShelf / deleteWork clean up the
// WORK/SHELF rows that point at what they remove.
model SoundtrackMapping {
  id           String               @id @default(uuid())
  userId       String
  user         User                 @relation(fields: [userId], references: [id])
  soundtrackId String
  soundtrack   Soundtrack           @relation(fields: [soundtrackId], references: [id], onDelete: Cascade)
  targetType   SoundtrackTargetType
  targetKey    String
  createdAt    DateTime             @default(now())

  @@unique([userId, targetType, targetKey])
  @@index([soundtrackId])
}

enum SoundtrackTargetType {
  WORK
  SHELF
  GENRE
  MOOD
  SITUATION
}

// SRS §21 — a browser/device the user reads on (Phase 9, T-066).
// `deviceId` is generated once by the client and sent as X-Device-Id.
model DeviceSession {
  id         String    @id @default(uuid())
  userId     String
  user       User      @relation(fields: [userId], references: [id])
  deviceId   String
  label      String
  lastSeenAt DateTime  @default(now())
  lastSyncAt DateTime?
  createdAt  DateTime  @default(now())

  @@unique([userId, deviceId])
}

// One replayed offline write (T-069). `clientEventId` makes replay
// idempotent. CONFLICT rows double as the pending reading-position
// conflicts the reader resolves (T-070) — `detail` holds both sides.
model SyncEvent {
  id              String                  @id @default(uuid())
  userId          String
  user            User                    @relation(fields: [userId], references: [id])
  deviceId        String
  clientEventId   String
  type            SyncEventType
  payload         Json
  clientCreatedAt DateTime
  receivedAt      DateTime                @default(now())
  status          SyncEventStatus
  detail          Json?
  resolvedAt      DateTime?
  resolution      SyncConflictResolution?

  @@unique([userId, clientEventId])
  @@index([userId, status])
}

enum SyncEventType {
  SESSION_RECORDED
  ANNOTATION_CREATED
  ANNOTATION_UPDATED
  ANNOTATION_DELETED
  NOTE_CREATED
  NOTE_UPDATED
  NOTE_DELETED
  BOOKMARK_CREATED
  BOOKMARK_DELETED
  PREFERENCE_SET
}

enum SyncEventStatus {
  APPLIED
  SKIPPED
  CONFLICT
  REJECTED
}

enum SyncConflictResolution {
  SERVER
  DEVICE
}

// SRS §21.1 — bookmarks follow the account (Phase 9, T-067; they were
// per-browser localStorage before). Anchored to the reader's copy, like
// Annotation.
model Bookmark {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  copyId    String
  copy      Copy     @relation(fields: [copyId], references: [id])
  position  String
  label     String
  createdAt DateTime @default(now())

  @@index([userId, copyId])
}

// SRS §21.2 "last-write-wins for simple preferences" (T-068).
// `updatedAt` is the client's timestamp of the change, so an older
// offline edit replayed late can't overwrite a newer one.
model UserPreference {
  userId            String
  user              User     @relation(fields: [userId], references: [id])
  key               String
  value             Json
  updatedAt         DateTime
  updatedByDeviceId String?

  @@id([userId, key])
}

// SRS §20.4 / §38.5 — what the user has agreed to (Phase 10, T-078). Both
// consents are off until the user turns them on; see docs/AI_DATA_POLICY.md.
model AiConsent {
  userId         String   @id
  user           User     @relation(fields: [userId], references: [id])
  semanticSearch Boolean  @default(false) // local embeddings, nothing leaves Bunko
  generative     Boolean  @default(false) // excerpts sent to NVIDIA NIM
  translation    Boolean  @default(false) // chapter text sent to NVIDIA NIM (Phase 11)
  policyVersion  String
  updatedAt      DateTime @updatedAt
}

// One embedded excerpt of a user's own content (T-080). Written only by
// ai-service (raw SQL — Prisma can't write vector columns); the Express
// API only ever deletes from it, when consent is revoked. See §6.
model AiEmbedding {
  id          String                     @id @default(uuid())
  userId      String
  user        User                       @relation(fields: [userId], references: [id])
  sourceType  AiSourceType
  sourceId    String
  workId      String
  content     String
  contentHash String
  embedding   Unsupported("vector(384)")
  updatedAt   DateTime                   @default(now())

  @@unique([sourceType, sourceId])
  @@index([userId])
}

enum AiSourceType {
  ANNOTATION
  NOTE
  REVIEW
}

// SRS §20.5 — one AI translation of one chapter, for the user who asked
// (Phase 11, T-088). Never shared across users, even for the same edition
// (§25.4). `sourceHash` is the hash of the chapter text it was made from, so
// a re-extracted chapter shows the translation as stale.
model ChapterTranslation {
  id             String            @id @default(uuid())
  userId         String
  user           User              @relation(fields: [userId], references: [id])
  editionId      String
  edition        Edition           @relation(fields: [editionId], references: [id])
  structuralId   String
  targetLanguage String
  sourceHash     String
  charCount      Int
  status         TranslationStatus
  segmentsDone   Int               @default(0)
  segmentsTotal  Int
  text           String            @default("")
  error          String?
  model          String?
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt

  @@unique([userId, editionId, structuralId, targetLanguage])
  @@index([userId, editionId])
}

enum TranslationStatus {
  PENDING
  READY
  FAILED
}
```

## 3. Key Relationships (matches `SRS.md` §27.2)

```
User 1 --- N ReadingJourney
Work 1 --- N Edition
Edition 1 --- N Copy
ReadingJourney 1 --- N ReadingSession
User N --- N Work        (via UserWork)
User N --- N Shelf        (via ShelfWork/UserWork)
User 1 --- N ShelfArrangement
Copy 1 --- 0..1 DigitalFile
Copy 1 --- N Annotation
Copy 1 --- N Note
Work 1 --- N Note
ReadingSession 1 --- N Annotation
ReadingSession 1 --- N Note
ReadingJourney 1 --- 0..1 ReadingPosition (canonical position)
User 1 --- N Review
Work 1 --- N Review          (@@unique([userId, workId]) caps it at one per user)
User 1 --- N Soundtrack
Soundtrack 1 --- N SoundtrackMapping   (cascade delete; one mapping per user+target)
User 1 --- N DeviceSession   (one per user+deviceId)
User 1 --- N SyncEvent       (one per user+clientEventId)
Copy 1 --- N Bookmark
User 1 --- N UserPreference  (one per user+key)
User 1 --- 0..1 AiConsent
User 1 --- N AiEmbedding     (one per source row; deleted on consent revoke)
User 1 --- N ChapterTranslation  (one per edition+chapter+language; deleted on consent revoke)
Edition 1 --- N ChapterTranslation  (per user only, never shared)
```

## 4. External Metadata Source (SRS §16)

`Work.externalSource`/`externalId` records where a book's metadata
came from (see `ARCHITECTURE.md` §11 for the provider decision). This
is deliberately nullable and non-unique-alone:

- A book added via metadata search stores the provider's stable ID
  (e.g. Open Library's `OL45804W`) so re-adding the same book resolves
  to the existing `Work` row instead of creating a duplicate
  (`@@unique([externalSource, externalId])` — Postgres treats rows
  where both are `NULL` as distinct, so manual entries never collide).
- A manually-entered book (no metadata search used) leaves both
  fields `null`.
- Only `Work`-level metadata is deduplicated this way for MVP;
  `Edition`-level external IDs (e.g. per-ISBN edition records) are not
  tracked separately in MVP — one `Work` may accumulate multiple
  `Edition` rows from user input without cross-referencing the
  provider's own edition data.

## 5. Deferred (do not create yet)

`Annotation` (Highlight/Quote) and `Note` shipped in Phase 6; `Review`
in Phase 7; `Soundtrack` and `SoundtrackMapping` in Phase 8;
`DeviceSession`, `SyncEvent`, `Bookmark`, and `UserPreference` in Phase 9;
`AiConsent` and `AiEmbedding` in Phase 10; `ChapterTranslation` in
Phase 11 — see §2 above.

- `Tag`, `BookTag` (MVP uses `Shelf` only; tags are Phase 6/7 polish —
  `Annotation.tags` on quotes is the one Phase 6 exception, scoped to
  quotes specifically per SRS §13.3, not a general tagging system)

Adding these tables before their phase begins is scope creep — see
`AGENTS.md` §3.

## 6. Vector Search (Phase 10)

The Postgres images are `pgvector/pgvector:pg16`, and the Phase 10
migration enables the extension through Prisma's `postgresqlExtensions`
preview feature (`extensions = [vector]` in the datasource), so it's part
of the schema rather than a hand-run step. `AiEmbedding.embedding` is
`vector(384)` — it must match the ai-service embedding model's
dimensions. There's deliberately no ANN index yet: every search is scoped
to one user's own rows (`@@index([userId])`), so an exact scan is fast at
this scale; add an HNSW index only if a single library grows large
enough to need it. Prisma can't write `Unsupported` vector columns, so
only ai-service inserts rows (raw SQL); the API only deletes them, when
a user revokes consent (`docs/AI_DATA_POLICY.md`).

## 7. Storage Quotas (SRS §38.6)

Enforced at the application layer, not the DB:

- Default per-user storage quota: **2 GB** (configurable via
  `USER_STORAGE_QUOTA_BYTES` env var).
- Enforced in `files/` module before accepting an upload
  (`DigitalFile.sizeBytes` sum per user).
- Deduplication: if `checksum` matches an existing `DigitalFile` for
  the same user, reuse it instead of storing a duplicate blob.
