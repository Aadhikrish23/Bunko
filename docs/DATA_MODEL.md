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
  id          String   @id @default(uuid())
  title       String
  seriesId    String?
  series      Series?  @relation(fields: [seriesId], references: [id])
  description String?
  genres      String[] // simple string array for MVP; normalise later if needed
  createdAt   DateTime @default(now())

  authors  WorkAuthor[]
  editions Edition[]
  users    UserWork[]
}

model WorkAuthor {
  workId   String
  authorId String
  work     Work   @relation(fields: [workId], references: [id])
  author   Author @relation(fields: [authorId], references: [id])

  @@id([workId, authorId])
}

// A user's relationship to a Work (library membership) — SRS §15
model UserWork {
  userId    String
  workId    String
  user      User     @relation(fields: [userId], references: [id])
  work      Work     @relation(fields: [workId], references: [id])
  status    ReadingStatus @default(WANT_TO_READ)
  addedAt   DateTime @default(now())

  shelves ShelfWork[]

  @@id([userId, workId])
}

enum ReadingStatus {
  WANT_TO_READ
  READING
  FINISHED
  DID_NOT_FINISH
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

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId, startTime])
}

enum SessionStatus {
  ACTIVE
  PAUSED
  ENDED
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
```

## 3. Key Relationships (matches `SRS.md` §27.2)

```
User 1 --- N ReadingJourney
Work 1 --- N Edition
Edition 1 --- N Copy
ReadingJourney 1 --- N ReadingSession
User N --- N Work        (via UserWork)
User N --- N Shelf        (via ShelfWork/UserWork)
Copy 1 --- 0..1 DigitalFile
ReadingJourney 1 --- 0..1 ReadingPosition (canonical position)
```

## 4. Deferred to Phase 6+ (do not create yet)

- `Highlight`, `Quote`, standalone `Note` with location anchoring
- `Review`, `Rating`
- `Tag`, `BookTag` (MVP uses `Shelf` only; tags are Phase 6/7 polish)
- `Soundtrack`, `SoundtrackMapping`
- `DeviceSession`, `SyncEvent` (offline/sync, Phase 9)

Adding these tables before their phase begins is scope creep — see
`AGENTS.md` §3.

## 5. Storage Quotas (SRS §38.6)

Enforced at the application layer, not the DB:

- Default per-user storage quota: **2 GB** (configurable via
  `USER_STORAGE_QUOTA_BYTES` env var).
- Enforced in `files/` module before accepting an upload
  (`DigitalFile.sizeBytes` sum per user).
- Deduplication: if `checksum` matches an existing `DigitalFile` for
  the same user, reuse it instead of storing a duplicate blob.
