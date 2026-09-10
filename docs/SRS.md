# Software Requirements Specification (SRS)

## Bunko --- Personal Digital & Physical Reading Library

**Document Version:** 1.1\
**Status:** Baseline Product Requirements (Revised)\
**Prepared For:** Product Design & Software Development\
**Prepared By:** Bunko Product Team\
**Date:** 11 September 2026

------------------------------------------------------------------------

# Document Control

  -----------------------------------------------------------------------
  Version           Date              Status            Description
  ----------------- ----------------- ----------------- -----------------
  1.0               2026-09-10        Baseline          Initial
                                                        comprehensive SRS
                                                        covering the
                                                        agreed Bunko
                                                        product vision

  1.1               2026-09-11        Revised           Added concrete
                                                        edition-mapping
                                                        algorithm (Sec.
                                                        11), detailed
                                                        reading session UX
                                                        flow (Sec. 12),
                                                        and explicit MVP
                                                        boundary
                                                        definition (Sec.
                                                        36)

  -----------------------------------------------------------------------

------------------------------------------------------------------------

# Table of Contents

1.  Introduction
2.  Product Vision and Objectives
3.  Scope
4.  Definitions and Terminology
5.  Stakeholders and User Roles
6.  Product Principles
7.  High-Level Product Architecture
8.  Functional Requirements
9.  Detailed Feature Requirements
10. Digital Book Reader Requirements
11. Physical/Digital Reading Continuity
12. Reading Sessions and Journal
13. Notes, Highlights and Quotes
14. Reviews and Ratings
15. Library, Shelves and Collections
16. Metadata, Books, Editions and Copies
17. Reading Soundtrack
18. Search and Discovery
19. Statistics and Insights
20. AI Capabilities
21. Synchronization and Offline Support
22. Notifications and Reminders
23. Authentication and Account Management
24. File Management and Storage
25. Privacy, Security and Copyright Boundaries
26. Non-Functional Requirements
27. Data Model
28. API and Integration Requirements
29. UX/UI Requirements
30. Error Handling
31. Accessibility
32. Observability and Auditability
33. Testing and Quality Assurance
34. Deployment and Environment Requirements
35. Acceptance Criteria
36. MVP / Phase-Wise Delivery
37. Future Enhancements
38. Risks and Open Questions
39. Appendix A --- Example User Journeys
40. Appendix B --- Definition of Done

------------------------------------------------------------------------

# 1. Introduction

## 1.1 Purpose

This Software Requirements Specification defines the functional,
non-functional, technical, security, usability, data, integration, and
quality requirements for **Bunko**, a personal reading platform intended
to manage a user's physical and digital books while preserving the
user's complete reading experience.

The document is intended to be sufficiently precise for a software
development organisation, product team, UI/UX team, QA team, DevOps
team, and project management team to estimate, design, implement, test,
deploy, and maintain the system.

This document establishes the baseline requirements. Any implementation
decision that changes externally visible behaviour, security guarantees,
data ownership, or core product functionality should be treated as a
controlled requirement change.

## 1.2 Product Summary

Bunko is a personal reading ecosystem rather than a simple book tracker.

The platform shall allow a user to:

-   Maintain a personal library of books.
-   Track physical books and digital books.
-   Import user-provided digital book files such as EPUB and PDF.
-   Read supported digital books directly within Bunko.
-   Track reading progress automatically while reading digitally.
-   Track reading progress manually when reading physical books.
-   Record reading sessions as a personal reading journal.
-   Keep notes, highlights, quotes, and reviews associated with books
    and reading locations.
-   Continue a reading journey across physical and digital editions of
    the same work.
-   Synchronize reading state across supported devices.
-   Read imported digital books offline.
-   Associate music and playlists with the reading experience.
-   Use book genre, atmosphere, mood, and user-defined playlists to
    create a contextual reading soundtrack.
-   View reading statistics and historical patterns.
-   Eventually use AI to understand the user's reading history, notes,
    quotes, and preferences and provide personal insights.

## 1.3 Intended Audience

This SRS is intended for:

-   Product owners
-   Business analysts
-   Software architects
-   Backend developers
-   Frontend/mobile developers
-   UI/UX designers
-   QA and automation engineers
-   DevOps/SRE engineers
-   Security engineers
-   Data/AI engineers
-   Project managers
-   External software development organisations

------------------------------------------------------------------------

# 2. Product Vision and Objectives

## 2.1 Vision

> **Bunko is a personal archive of a reader's relationship with books.**

Bunko shall not merely answer:

> "Which books have I read?"

It shall preserve:

> "What did I read, how did I read it, what did I think about it, what
> did I remember, and how did my reading life evolve?"

## 2.2 Primary Objectives

1.  Provide a single personal library for physical and digital books.
2.  Make digital reading possible without leaving Bunko.
3.  Make reading-progress tracking as automatic as possible.
4.  Preserve reading sessions as a long-term journal.
5.  Connect notes, quotes, highlights, and reviews to the relevant book
    and reading location.
6.  Maintain one logical reading journey across different editions and
    formats.
7.  Provide a distraction-minimised but immersive reading experience.
8.  Make personal reading history useful through statistics and
    insights.
9.  Provide optional contextual music/soundtrack functionality.
10. Establish a foundation for future AI-powered personal reading
    intelligence.

## 2.3 Success Characteristics

Bunko should feel:

-   Personal
-   Calm
-   Immersive
-   Reliable
-   Fast
-   Private
-   Book-centric
-   Long-term
-   Cross-device
-   Delightful rather than overly gamified

------------------------------------------------------------------------

# 3. Scope

## 3.1 In Scope

The baseline product includes:

-   User accounts and authentication
-   Personal library
-   Books, authors, series, genres, editions and copies
-   Physical book tracking
-   Digital book import
-   Digital book reader
-   Reading progress
-   Reading sessions/journal
-   Notes
-   Highlights
-   Quotes
-   Reviews
-   Ratings
-   Shelves/collections/tags
-   Search and filtering
-   Reading statistics
-   Cross-device synchronization
-   Offline digital reading
-   Reading soundtrack configuration
-   Book and reading metadata
-   Secure file storage
-   Privacy and account controls
-   AI-ready data architecture
-   Future AI features as defined in this SRS

## 3.2 Out of Scope for Baseline

The following are not required unless separately approved:

-   Distribution of copyrighted books
-   Downloading books from unauthorised sources
-   DRM circumvention
-   P2P/torrent functionality
-   Public hosting of copyrighted books
-   Social networking as a core requirement
-   Commercial ebook marketplace
-   Ebook purchasing
-   Replacement of dedicated commercial ebook DRM systems
-   Full audiobook platform
-   Full music streaming service

Bunko may allow users to import files they possess, subject to
applicable law, licensing, platform policies, and provider terms.

------------------------------------------------------------------------

# 4. Definitions and Terminology

  -----------------------------------------------------------------------
  Term                                Definition
  ----------------------------------- -----------------------------------
  Work                                The abstract literary work
                                      independent of a particular edition
                                      or format.

  Book                                User-facing representation of a
                                      literary work in Bunko.

  Edition                             A specific published version of a
                                      work, potentially differing in
                                      publisher, language, format,
                                      pagination, etc.

  Copy                                A user's physical or digital
                                      instance of an edition.

  Physical Book                       A physical copy tracked by the
                                      user.

  Digital Book                        A user-provided digital file
                                      associated with a book/edition.

  Reading Journey                     The user's cumulative progress and
                                      history for a work.

  Reading Position                    The user's canonical point within a
                                      work.

  Reading Session                     A period of reading recorded in
                                      Bunko.

  Journal                             The chronological history of a
                                      user's reading sessions and
                                      reflections.

  Highlight                           A selected passage or region of
                                      text.

  Quote                               A passage deliberately saved by the
                                      user for later reference.

  Note                                User-authored commentary associated
                                      with a book, chapter, page,
                                      passage, or general reading
                                      context.

  Shelf                               A user-defined collection of books.

  Soundtrack                          Music or audio configuration
                                      associated with a reading
                                      experience.

  Canonical Location                  A work-level location used to map
                                      progress across editions/formats.
  -----------------------------------------------------------------------

------------------------------------------------------------------------

# 5. Stakeholders and User Roles

## 5.1 Reader/User

The primary user who:

-   owns or tracks books;
-   reads physical or digital books;
-   records sessions;
-   creates notes and quotes;
-   configures soundtracks;
-   views statistics;
-   manages personal data.

## 5.2 System Administrator

Responsible for:

-   platform configuration;
-   operational monitoring;
-   security operations;
-   moderation where applicable;
-   user-support workflows.

Administrators shall not receive unrestricted access to private reading
content unless explicitly authorised by an appropriate support/security
process.

## 5.3 Development/Operations Team

Responsible for:

-   development;
-   deployment;
-   testing;
-   monitoring;
-   backups;
-   security;
-   incident response.

------------------------------------------------------------------------

# 6. Product Principles

## 6.1 One Book, One Reading Journey

Different editions and formats of the same work should contribute to one
logical reading history wherever reliable mapping is possible.

## 6.2 Automatic Where Possible

If Bunko can infer a reading state safely from user behaviour, the user
should not be forced to enter it manually.

## 6.3 Manual Override Always Available

The user shall be able to correct automatically detected progress.

## 6.4 User-Owned Experience

Notes, quotes, reviews, reading history, and preferences are personal
data and shall be treated as such.

## 6.5 Reading First

The reading experience must remain simple and distraction-free.

## 6.6 AI Is an Enhancement, Not the Product

AI should use Bunko's structured reading data to provide useful personal
intelligence rather than replace fundamental library and reading
functionality.

------------------------------------------------------------------------

# 7. High-Level Product Architecture

The system should be designed as modular components.

``` text
                         BUNKO
                           |
        +------------------+------------------+
        |                  |                  |
      Library           Reading          Experience
        |                  |                  |
   Books/Authors       Reader             Soundtrack
   Editions/Copies     Progress           Atmosphere
   Shelves             Sessions
   Metadata            Journal
        |                  |
        +---------+--------+
                  |
          Personal Reading
             Knowledge
                  |
       +----------+----------+
       |          |           |
     Notes      Quotes      Reviews
       |          |           |
       +----------+-----------+
                  |
             AI / Insights
```

A logical architecture should contain at least:

-   Client applications
-   API/backend services
-   Authentication service
-   Library service
-   Reading/progress service
-   Journal/session service
-   Annotation service
-   File/document service
-   Search service
-   Synchronization service
-   Notification service
-   Music integration layer
-   AI/insight service
-   Relational database
-   Object/file storage
-   Cache where required
-   Background job/event processing
-   Observability stack

------------------------------------------------------------------------

# 8. Functional Requirements

## FR-001 User Registration

The system shall allow a new user to create an account using supported
authentication methods.

## FR-002 Authentication

The system shall securely authenticate users and protect all private
user resources.

## FR-003 Personal Library

The system shall allow users to add, remove, edit, search, filter, and
organise books.

## FR-004 Book Metadata

The system shall maintain structured metadata including, where
available:

-   title;
-   subtitle;
-   authors;
-   cover;
-   ISBN;
-   language;
-   publisher;
-   publication date;
-   page count;
-   format;
-   genre;
-   series;
-   series position;
-   description;
-   tags.

## FR-005 Physical Book

Users shall be able to mark a copy as physical and optionally record:

-   edition;
-   ownership;
-   purchase information;
-   physical page count;
-   location;
-   condition;
-   notes.

## FR-006 Digital Book Import

Users shall be able to import supported user-provided digital files.

Initial supported formats:

-   EPUB
-   PDF

The architecture should permit additional formats later.

## FR-007 Digital Reader

Users shall be able to open supported digital books in Bunko's
integrated reader.

## FR-008 Reading Progress

The system shall record reading progress for both physical and digital
reading.

## FR-009 Reading Sessions

Users shall be able to start, pause, resume, complete, edit, and review
reading sessions.

## FR-010 Automatic Digital Progress

The reader shall automatically persist reading position at appropriate
intervals and on important lifecycle events such as page/location
changes, app backgrounding, closing the reader, and session termination.

## FR-011 Manual Physical Progress

Users shall be able to record physical reading progress using
page/chapter/section information.

## FR-012 Cross-Format Continuity

The system shall attempt to map a canonical reading position from a
physical edition to a digital edition and vice versa.

## FR-013 Notes

Users shall be able to create notes associated with books and, where
possible, exact reading locations.

## FR-014 Highlights

Users shall be able to highlight supported text within the digital
reader.

## FR-015 Quotes

Users shall be able to save passages as quotes and associate metadata
such as page/chapter and personal commentary.

## FR-016 Reviews

Users shall be able to write a review and rating for a book/work.

## FR-017 Shelves

Users shall be able to create custom shelves and assign books to
multiple shelves.

## FR-018 Search

Users shall be able to search their library by title, author, series,
ISBN, genre, tags, and other supported metadata.

## FR-019 Statistics

The system shall calculate reading statistics from reading history.

## FR-020 Soundtrack

Users shall be able to configure music/playlists associated with books
and reading moods.

## FR-021 Synchronization

User library, reading progress, annotations, sessions, and supported
preferences shall synchronize across authenticated devices.

## FR-022 Offline Reading

Previously downloaded supported digital books shall be readable offline.

## FR-023 AI

The system shall provide an architecture for future AI-powered personal
reading analysis.

------------------------------------------------------------------------

# 9. Detailed Feature Requirements

# 9.1 Library Management

## 9.1.1 Add Book

Users shall be able to add books by:

-   searching metadata;
-   manually entering metadata;
-   scanning ISBN/barcode where supported;
-   importing a digital file.

## 9.1.2 Book Status

A book may have statuses including:

-   Want to Read
-   Not Started
-   Currently Reading
-   Paused
-   Completed
-   Abandoned

The system shall preserve historical status transitions.

## 9.1.3 Multiple Books and Editions

The system shall support a single work having multiple editions and
formats.

Example:

``` text
Six of Crows
|
+-- Paperback Edition
|    +-- Physical Copy
|
+-- EPUB Edition
|    +-- Digital Copy
|
+-- PDF Edition
     +-- Digital Copy
```

------------------------------------------------------------------------

# 10. Digital Book Reader Requirements

## 10.1 General

The reader shall support:

-   opening imported files;
-   navigation;
-   page/location progression;
-   chapter navigation;
-   table of contents;
-   bookmarks;
-   highlights;
-   notes;
-   reading position persistence;
-   configurable typography for supported formats;
-   light/dark reading modes where technically appropriate.

## 10.2 EPUB

For EPUB, the system should support:

-   reflowable text;
-   chapter navigation;
-   table of contents;
-   adjustable font size;
-   adjustable line spacing;
-   adjustable margins;
-   theme/background configuration;
-   text selection;
-   highlights;
-   annotations.

## 10.3 PDF

For PDF, the system shall support:

-   page navigation;
-   zoom;
-   search;
-   bookmarks where present;
-   page-based progress;
-   annotations where supported;
-   continuous reading.

## 10.4 Reader Position

The system shall save:

-   work ID;
-   edition ID;
-   format;
-   document-specific location;
-   canonical location where available;
-   timestamp;
-   session ID where applicable.

------------------------------------------------------------------------

# 11. Physical/Digital Reading Continuity

This is a core differentiating requirement.

## 11.1 Requirement

A user may read the same work using different formats at different
times.

Example:

1.  User reads a physical copy.
2.  User completes Chapter 10.
3.  User records a reading session.
4.  User later opens the EPUB version.
5.  Bunko identifies the corresponding location.
6.  Bunko automatically navigates the digital reader to the closest
    reliable equivalent location.

## 11.2 Canonical Position

The system shall not rely exclusively on raw page numbers because page
numbering differs across editions.

A canonical position should preferably use:

-   chapter identity;
-   section identity;
-   structural document identifiers;
-   normalized text anchors;
-   content fingerprints where appropriate;
-   page number as an edition-specific fallback.

## 11.3 Mapping Priority

Mapping should attempt, in order:

1.  Exact structural location.
2.  Chapter/section mapping.
3.  Stable document identifier.
4.  Text-anchor/fingerprint mapping.
5.  Page mapping where reliable.
6.  User confirmation when confidence is insufficient.

## 11.4 Confidence

Each automatic mapping may have a confidence score.

If confidence is low, the system should not silently jump to an
incorrect location.

Instead:

> "We found a likely match near Chapter 10. Continue here?"

## 11.5 User Correction

The user shall be able to correct a mapped location.

Corrections may improve future mapping for the user's specific editions.

## 11.6 Import-Time Indexing Pipeline

To make mapping possible at read-time, every digital edition shall be
indexed once at import time. This indexing is the foundation the
runtime mapping algorithm (11.7) depends on.

1.  **Structural parse.** Extract the edition's native structure
    (table of contents, chapter/section headings, EPUB spine order, PDF
    bookmarks/outline where present).
2.  **Canonical chapter graph.** Build an ordered list of structural
    units (e.g. `Chapter 1`, `Chapter 2`, ...) and assign each a stable
    `structural_id`, independent of page numbers.
3.  **Text normalization.** For each structural unit, normalise the
    text (strip whitespace/formatting, lowercase, collapse punctuation)
    to produce a comparable text stream.
4.  **Anchor generation.** Generate rolling n-gram fingerprints (for
    example, hashes of every 12-15 word window) across the normalised
    text and store them with their offset. These are the "text
    anchors" referenced in 11.2.
5.  **Page-fallback table.** Where the source format exposes page
    numbers (fixed-layout PDF, page-list metadata in EPUB), record a
    best-effort `structural_id -> page number` table for use only as a
    last-resort fallback.

The output of this pipeline is stored per edition, so importing a
second copy of an edition the user already owns does not require
re-indexing.

## 11.7 Runtime Mapping Algorithm

Given a canonical position recorded against one edition (source), the
system resolves the corresponding location in a different edition
(target) as follows:

1.  **Same structural ID.** If the source position's `structural_id`
    exists in the target edition's chapter graph, jump directly to it.
    Confidence: high (~0.9-1.0).
2.  **Chapter/section title match.** If no exact ID match, compare
    normalised chapter/section titles between source and target. A
    close text match (e.g. fuzzy string match above a set threshold)
    is used. Confidence: medium-high (~0.7-0.9).
3.  **Text-anchor search.** If the source position has nearby
    highlighted or bookmarked text, take the surrounding n-gram
    fingerprints and search for the best-matching window in the
    target edition's anchor table. Confidence is proportional to
    fingerprint match strength (~0.4-0.85).
4.  **Proportional/page fallback.** If none of the above succeed, fall
    back to proportional position (source position as a percentage of
    total source length, applied to target length) or the page-fallback
    table where available. Confidence: low (~0.2-0.4).
5.  **Below-threshold outcome.** If the best available confidence
    score falls below a configurable minimum threshold, the system
    shall not auto-navigate; it shall present the confirmation prompt
    described in 11.4 and offer the nearest candidate(s) for the user
    to choose from.

## 11.8 Confidence Scoring

Confidence is a weighted combination of signal strength and signal
type, approximately:

``` text
confidence = w1 * structural_match
           + w2 * title_similarity
           + w3 * anchor_match_strength
           - w4 * edition_length_delta_penalty
```

Exact weighting is an implementation detail, but the ordering of
signal reliability in 11.7 (structural ID > title match > text anchor
> proportional/page) shall be preserved so that stronger signals are
never overridden by weaker ones.

## 11.9 Worked Example

``` text
Source: Physical copy, "Chapter 10", user-recorded canonical position.
Target: Newly opened EPUB edition of the same work.

Step 1 - Structural ID match:
  Physical copies have no structural_id (manually tracked), so this
  step is skipped.

Step 2 - Title match:
  Target chapter graph contains "Chapter 10: The Reckoning".
  Source session recorded chapter label "Chapter 10".
  Fuzzy match succeeds -> confidence 0.85.

Step 3 - Text-anchor search:
  Not needed; Step 2 already cleared the confirmation threshold (0.6).

Result:
  Reader opens at the start of "Chapter 10: The Reckoning".
  Prompt shown (per 11.4) since confidence is in the 0.7-0.9 band:
  "We found a likely match near Chapter 10. Continue here?"
  User confirms -> mapping stored and reused for this user's edition
  pair without re-prompting next time.
```

------------------------------------------------------------------------

# 12. Reading Sessions and Journal

## 12.1 Purpose

A reading session represents an interval or event in the user's reading
activity.

## 12.2 Session Fields

A session may contain:

-   user ID;
-   book/work ID;
-   edition/copy ID;
-   start time;
-   end time;
-   duration;
-   starting position;
-   ending position;
-   pages/locations progressed;
-   chapter;
-   notes;
-   quotes;
-   highlights;
-   soundtrack used;
-   reading medium;
-   device;
-   optional user reflection.

## 12.3 Physical Session Example

``` text
Book: Ponniyin Selvan
Medium: Physical
Chapter: 10
Duration: 42 minutes
Progress: Chapter 9 -> Chapter 10
Notes: 2
Quotes: 1
Reflection:
"Political tension is increasing."
```

## 12.4 Digital Session Example

``` text
Book: Six of Crows
Medium: EPUB
Start: Location 3821
End: Location 4170
Duration: 51 minutes
Notes: 1
Highlights: 4
```

## 12.5 Journal

The user shall have a chronological journal showing reading activity.

Example:

``` text
10 Sep
Six of Crows
51 minutes
Chapter 10 -> Chapter 12
2 notes

09 Sep
Ponniyin Selvan
38 minutes
Chapter 9 -> Chapter 10
1 quote
```

## 12.6 Editing

Users shall be able to correct session metadata.

## 12.7 Session Lifecycle and States

A reading session shall move through the following states:

``` text
[Not Started] -> [Active] -> [Paused] -> [Active] -> [Ended]
```

-   **Not Started:** No open session exists for the user/book pair.
-   **Active:** A session is currently recording elapsed time and, for
    digital books, progress.
-   **Paused:** The session is temporarily suspended (app backgrounded,
    idle timeout reached, or user-initiated pause). Elapsed time stops
    accumulating.
-   **Ended:** The session is finalised, its summary is computed, and
    it is written to the Journal.

Only one session per user may be Active at a time. Opening a second
book while a session is Active shall prompt the user to end or pause
the current session first.

## 12.8 Starting and Ending a Session --- Digital Books

Digital sessions are automatic by default, minimising friction:

1.  User opens a digital book in the Reader.
2.  Bunko automatically starts a session in the **Active** state
    (start time = open time, starting position = last saved position).
3.  While Active, Bunko silently records position changes as the user
    reads/scrolls/turns pages; no manual action is required.
4.  If the app is backgrounded or the reader is idle beyond a
    configurable threshold (default 5 minutes of no page-turns), the
    session automatically transitions to **Paused**.
5.  If the user returns within a short grace window (default 15
    minutes), the session resumes as the same session (Active). Beyond
    the grace window, the Paused session is automatically **Ended** so
    that idle time is not counted as reading time.
6.  When the user explicitly closes the book or the session Ends,
    Bunko shows a lightweight, dismissible session summary (duration,
    pages/locations progressed, notes/highlights created) with an
    optional prompt to add a reflection (12.9).

## 12.9 Starting and Ending a Session --- Physical Books

Physical sessions require manual initiation since Bunko cannot detect
physical page-turns automatically:

1.  User selects a physical book from the library and taps **Start
    Reading Session**.
2.  Bunko starts a session in the **Active** state, recording start
    time and starting chapter/position (defaulting to the last
    recorded position).
3.  While Active, the user may optionally add notes, quotes, or
    highlights tied to the current chapter without ending the session.
4.  User taps **End Session** and is prompted for the ending
    chapter/position (required) via a simple chapter/page picker.
5.  Bunko computes duration and progress, and shows the same session
    summary and optional reflection prompt as 12.8, step 6.
6.  If the user forgets to end a session, Bunko shall surface a
    reminder after a configurable period (default 12 hours) rather
    than leaving the session open indefinitely; the user can confirm
    an end time or discard the session.

## 12.10 Reflection Prompt Flow

The reflection prompt is optional and never blocking:

``` text
Session ended
    |
Summary shown: "42 min · Chapter 9 -> Chapter 10 · 2 notes"
    |
Optional field: "Add a quick reflection (optional)"
    |
User types free text OR taps "Skip"
    |
Session finalised and written to Journal either way
```

Reflections, once saved, are editable from the Journal entry at any
time (12.6).

## 12.11 Multiple Sessions and Same-Day Aggregation

Multiple sessions for the same book on the same day are stored as
separate Journal entries rather than merged automatically, preserving
an accurate record of distinct reading intervals. The Journal view
(12.5) may visually group same-day, same-book sessions for readability
without altering the underlying stored records.

------------------------------------------------------------------------

# 13. Notes, Highlights and Quotes

## 13.1 Notes

A note may be:

-   book-level;
-   chapter-level;
-   section-level;
-   page-level;
-   passage-level;
-   session-level.

## 13.2 Highlights

Highlights shall preserve, where possible:

-   selected text;
-   start/end location;
-   chapter;
-   document location;
-   creation time;
-   optional colour/category.

## 13.3 Quotes

A quote shall preserve:

-   exact selected text;
-   book/work;
-   edition;
-   location;
-   chapter;
-   page where available;
-   user's comment;
-   tags;
-   creation timestamp.

## 13.4 Personal Annotation

The system shall clearly distinguish source text from user-generated
content.

------------------------------------------------------------------------

# 14. Reviews and Ratings

Users shall be able to:

-   rate a book;
-   write a review;
-   edit a review;
-   delete a review;
-   optionally mark favourite;
-   optionally mark reread intention;
-   optionally record favourite character or other structured metadata.

Ratings shall support a configurable scale, with 5-star rating as the
initial default.

------------------------------------------------------------------------

# 15. Library, Shelves and Collections

## 15.1 Default Collections

The system should provide:

-   All Books
-   Currently Reading
-   Want to Read
-   Completed
-   Paused
-   Abandoned

## 15.2 Custom Shelves

Users shall be able to create custom shelves such as:

-   Favourite Books
-   Tamil Literature
-   Fantasy
-   Historical
-   To Reread
-   Books I Own

A book may belong to multiple shelves.

## 15.3 Tags

Tags shall support flexible cross-cutting classification.

------------------------------------------------------------------------

# 16. Metadata, Books, Editions and Copies

## 16.1 Domain Model Principle

The system shall distinguish:

``` text
Work
  |
  +-- Edition
       |
       +-- User Copy
```

## 16.2 Work

Represents the conceptual literary work.

## 16.3 Edition

Represents a published manifestation of that work.

Examples of differences:

-   publisher;
-   language;
-   translation;
-   publication date;
-   format;
-   pagination.

## 16.4 Copy

Represents the user's possession or imported instance.

Copy type:

-   Physical
-   Digital

## 16.5 Metadata Extraction

On digital import, Bunko should attempt to extract metadata from the
file.

The user shall be able to review and correct extracted metadata before
final association.

------------------------------------------------------------------------

# 17. Reading Soundtrack

## 17.1 Objective

The soundtrack system shall provide optional music that complements the
reading experience.

It is not intended to replace a music streaming service.

## 17.2 User Playlist Association

Users shall be able to associate their own playlists with:

-   books;
-   genres;
-   moods;
-   reading situations;
-   custom shelves.

Example:

``` text
Historical -> Historical/Epic playlist
Thriller -> Eerie/Dark playlist
Fantasy -> Epic/Ambient playlist
Romance -> Romantic playlist
```

## 17.3 Book Soundtrack

A book may have a dedicated soundtrack configuration.

## 17.4 Mood Categories

The system should support configurable moods such as:

-   Calm
-   Epic
-   Dark
-   Mysterious
-   Tense
-   Romantic
-   Emotional
-   Adventure
-   Battle
-   Historical
-   Fantasy
-   Horror

## 17.5 Adaptive Soundtrack

Future functionality may associate different soundtracks with:

-   chapters;
-   moods;
-   user-defined reading sections;
-   narrative intensity.

This must remain optional.

## 17.6 External Music Services

Where supported, Bunko may integrate with third-party music services.

Bunko shall respect:

-   provider APIs;
-   licensing;
-   playback restrictions;
-   authentication requirements;
-   platform policies.

Bunko shall not store or redistribute copyrighted music unless
explicitly licensed.

## 17.7 User Control

The user shall be able to:

-   enable/disable soundtrack;
-   select a playlist;
-   control volume where permitted;
-   choose manual or automatic soundtrack;
-   stop music immediately.

------------------------------------------------------------------------

# 18. Search and Discovery

## 18.1 Library Search

Search shall support:

-   title;
-   author;
-   series;
-   ISBN;
-   tags;
-   genre;
-   shelf;
-   reading status.

## 18.2 Advanced Filters

Users should be able to filter by:

-   status;
-   rating;
-   language;
-   format;
-   owned/not owned;
-   physical/digital;
-   series;
-   author;
-   completion date;
-   tags.

## 18.3 Future Discovery

Future releases may add recommendation and discovery functionality.

------------------------------------------------------------------------

# 19. Statistics and Insights

## 19.1 Basic Statistics

The system shall calculate:

-   books completed;
-   pages read;
-   reading time;
-   reading sessions;
-   average session duration;
-   average reading pace;
-   current reading streak;
-   longest reading streak;
-   books by genre;
-   books by author;
-   books by language;
-   books by format.

## 19.2 Time-Based Views

Statistics should support:

-   daily;
-   weekly;
-   monthly;
-   yearly;
-   all-time.

## 19.3 Reading Pace

Where enough reliable data exists, Bunko may calculate:

-   pages/hour;
-   pages/session;
-   average session duration.

For reflowable digital formats, progress may use document locations or
estimated equivalent progress rather than literal pages.

------------------------------------------------------------------------

# 20. AI Capabilities

AI functionality shall be implemented only where it provides meaningful
value.

## 20.1 Personal Reading Assistant

Future examples:

-   "What did I think about this book?"
-   "Summarize my thoughts on Mistborn."
-   "Show me the quotes I saved about courage."
-   "Compare the books I rated highly."
-   "What patterns do you see in my reading taste?"

## 20.2 Personal Recommendation

Recommendations should be based primarily on the user's own:

-   completed books;
-   ratings;
-   reviews;
-   notes;
-   genres;
-   shelves;
-   reading history;
-   preferences.

## 20.3 Reading Insights

The system may identify patterns such as:

-   preferred genres;
-   preferred authors;
-   reading pace;
-   preferred book length;
-   rating patterns;
-   recurring themes in notes;
-   frequently saved concepts.

AI-generated insights must be clearly labelled as generated
interpretations rather than objective facts.

## 20.4 AI Privacy

Private user content shall not be exposed to third parties without
appropriate user consent and contractual/legal controls.

------------------------------------------------------------------------

# 21. Synchronization and Offline Support

## 21.1 Synchronization

The system shall synchronize:

-   library;
-   books;
-   editions;
-   reading status;
-   reading position;
-   sessions;
-   notes;
-   highlights;
-   quotes;
-   reviews;
-   shelves;
-   tags;
-   soundtrack preferences;
-   bookmarks.

## 21.2 Conflict Resolution

Conflicts may occur when multiple devices update the same object while
offline.

The system shall use deterministic conflict-resolution rules.

Preferred strategy:

-   append-only events where appropriate;
-   last-write-wins for simple preferences;
-   explicit merge for annotations;
-   user resolution for conflicting reading positions when confidence is
    low.

## 21.3 Offline

Users shall be able to:

-   open downloaded digital books;
-   read;
-   create supported annotations;
-   record progress;
-   create sessions.

Offline changes shall be queued and synchronized when connectivity
returns.

------------------------------------------------------------------------

# 22. Notifications and Reminders

Notifications should be optional.

Potential notifications:

-   reading reminder;
-   unfinished book reminder;
-   reading goal progress;
-   streak milestone;
-   session reminder.

Notifications must be user-configurable.

The product shall avoid manipulative notification design.

------------------------------------------------------------------------

# 23. Authentication and Account Management

## 23.1 Authentication

The system should support secure modern authentication.

If password-based authentication is implemented, passwords shall be:

-   salted;
-   securely hashed;
-   never stored in plaintext.

## 23.2 Session Security

The system shall use secure access/session mechanisms.

For API-based authentication, the recommended architecture is:

-   short-lived access token;
-   refresh token;
-   refresh-token rotation;
-   revocation support;
-   secure storage;
-   device/session management.

## 23.3 Account Security

Users should be able to:

-   view active sessions/devices;
-   revoke sessions;
-   change credentials;
-   reset credentials;
-   delete account.

## 23.4 Authorisation

Every private resource must be authorised against the authenticated
user.

Object-level authorisation shall be enforced server-side.

------------------------------------------------------------------------

# 24. File Management and Storage

## 24.1 Digital Book Storage

Imported books shall be stored in secure object/file storage rather than
unnecessarily embedding binary content in relational database records.

## 24.2 File Validation

Uploads shall be validated for:

-   allowed extension;
-   actual MIME/type;
-   size limits;
-   structural validity;
-   malware/security threats where appropriate.

## 24.3 File Association

A digital file shall be associated with:

-   user;
-   work;
-   edition;
-   copy;
-   file metadata;
-   import timestamp.

## 24.4 File Deletion

Deleting a digital book shall have clearly defined behaviour for:

-   file;
-   metadata;
-   annotations;
-   reading history.

The default should avoid accidental destruction of unrelated reading
history.

------------------------------------------------------------------------

# 25. Privacy, Security and Copyright Boundaries

## 25.1 Privacy

Reading history, notes, reviews, imported books, and annotations are
private by default.

## 25.2 Data Isolation

A user must never be able to access another user's private books or
files.

## 25.3 Encryption

Sensitive data shall be protected:

-   in transit using TLS;
-   at rest using appropriate platform/storage encryption.

## 25.4 Copyright

Bunko may provide user-file import and personal reading functionality
subject to applicable laws and policies.

The system shall not intentionally provide:

-   pirated book discovery;
-   unauthorised copyrighted-book downloads;
-   DRM circumvention;
-   unauthorised redistribution.

The system should avoid making assumptions about the provenance of a
user-provided file unless a legal/compliance requirement requires
verification.

------------------------------------------------------------------------

# 26. Non-Functional Requirements

## NFR-001 Performance

Common library operations should normally respond within approximately 2
seconds under expected load.

## NFR-002 Reader Responsiveness

Reader navigation should feel immediate. Rendering should be optimised
for large documents.

## NFR-003 Availability

Production services should target high availability appropriate to the
agreed service tier.

## NFR-004 Scalability

The architecture should support growth in:

-   users;
-   books;
-   imported documents;
-   annotations;
-   sessions;
-   AI workloads.

## NFR-005 Security

The application shall follow secure software development practices
including:

-   OWASP-aligned controls;
-   secure authentication;
-   authorisation;
-   input validation;
-   secure file handling;
-   rate limiting;
-   secrets management;
-   dependency management.

## NFR-006 Maintainability

The codebase shall be modular, documented, tested, and suitable for
long-term maintenance.

## NFR-007 Observability

The system shall provide:

-   structured logs;
-   metrics;
-   tracing where appropriate;
-   health checks;
-   error tracking;
-   operational dashboards.

## NFR-008 Data Durability

User library and reading-history data shall be backed up according to an
agreed retention policy.

## NFR-009 Accessibility

The UI should target WCAG 2.2 AA where applicable.

## NFR-010 Portability

The architecture should avoid unnecessary vendor lock-in.

------------------------------------------------------------------------

# 27. Data Model

A recommended conceptual model is:

``` text
User
 |
 +-- Library
 |    |
 |    +-- Book/Work
 |         |
 |         +-- Author(s)
 |         +-- Series
 |         +-- Edition(s)
 |               |
 |               +-- Copy
 |                    |
 |                    +-- Digital File
 |
 +-- Reading Journey
 |     |
 |     +-- Reading Session(s)
 |     +-- Reading Position
 |
 +-- Annotation(s)
 |     +-- Note
 |     +-- Highlight
 |     +-- Quote
 |
 +-- Review(s)
 |
 +-- Shelf(s)
 |
 +-- Tag(s)
 |
 +-- Soundtrack Preferences
 |
 +-- Statistics / Derived Insights
```

## 27.1 Core Entities

Minimum entities should include:

-   User
-   Work/Book
-   Author
-   Series
-   Edition
-   Copy
-   DigitalFile
-   ReadingJourney
-   ReadingPosition
-   ReadingSession
-   Note
-   Highlight
-   Quote
-   Review
-   Shelf
-   Tag
-   BookTag
-   BookShelf
-   Soundtrack
-   SoundtrackMapping
-   DeviceSession
-   SyncEvent

## 27.2 Important Relationship

``` text
User 1 --- N ReadingJourney
Work 1 --- N Edition
Edition 1 --- N Copy
ReadingJourney 1 --- N ReadingSession
ReadingSession 1 --- N Annotation
Work 1 --- N Review
User N --- N Shelf
User N --- N Work
```

------------------------------------------------------------------------

# 28. API and Integration Requirements

## 28.1 API Style

The implementation organisation may choose REST, GraphQL, or another
appropriate API architecture, provided the following requirements are
met:

-   documented contracts;
-   authentication;
-   authorisation;
-   versioning strategy;
-   validation;
-   consistent error model;
-   pagination;
-   idempotency where required;
-   observability.

## 28.2 API Documentation

The backend shall provide machine-readable API documentation.

OpenAPI/Swagger is recommended.

## 28.3 Example API Domains

``` text
/auth
/users
/books
/authors
/series
/editions
/copies
/files
/reading
/sessions
/positions
/notes
/highlights
/quotes
/reviews
/shelves
/tags
/soundtracks
/statistics
/ai
/sync
```

## 28.4 External Integrations

Potential integrations include:

-   book metadata providers;
-   ISBN lookup;
-   music services;
-   cloud storage where explicitly supported;
-   AI model providers.

All external integrations must have clear failure handling and timeout
behaviour.

------------------------------------------------------------------------

# 29. UX/UI Requirements

## 29.1 Design Principles

The interface shall be:

-   book-centric;
-   clean;
-   calm;
-   responsive;
-   visually immersive;
-   easy to navigate;
-   low-friction.

## 29.2 Primary Navigation

A recommended navigation structure:

``` text
Home
Library
Reading
Journal
Notes/Quotes
Statistics
Settings
```

The exact navigation may vary by platform.

## 29.3 Book Detail Page

A book page should expose:

``` text
Cover
Title
Author
Metadata

[ Continue Reading ]

Reading Progress
Reading History

Notes
Highlights
Quotes
Review

Soundtrack

Edition / Copy Information
```

## 29.4 Reader

The reader should minimise UI while reading.

Controls may include:

-   progress;
-   table of contents;
-   search;
-   annotation;
-   bookmark;
-   typography;
-   soundtrack;
-   reader settings.

------------------------------------------------------------------------

# 30. Error Handling

The system shall provide user-friendly errors.

Examples:

### Invalid file

> "This file could not be opened as a supported EPUB/PDF."

### Failed metadata extraction

> "We couldn't identify all book details. Please review the metadata."

### Sync conflict

> "This book was updated on another device. Choose which reading
> position to continue from."

### Music provider unavailable

> "Your music service is currently unavailable. You can continue reading
> without the soundtrack."

Errors shall not expose sensitive internal details.

------------------------------------------------------------------------

# 31. Accessibility

The application should support:

-   keyboard navigation;
-   screen readers;
-   semantic controls;
-   sufficient contrast;
-   scalable text;
-   accessible focus states;
-   accessible forms;
-   alternative text for meaningful images;
-   reduced-motion preferences where applicable.

The digital reader should support accessibility capabilities of the
underlying platform/browser where possible.

------------------------------------------------------------------------

# 32. Observability and Auditability

Operational systems should record:

-   authentication events;
-   file import failures;
-   reader errors;
-   synchronization failures;
-   background job failures;
-   integration failures;
-   security-relevant events.

Logs must not unnecessarily contain:

-   passwords;
-   authentication tokens;
-   private document contents;
-   sensitive personal information.

------------------------------------------------------------------------

# 33. Testing and Quality Assurance

## 33.1 Test Levels

The project shall include:

-   unit tests;
-   integration tests;
-   API tests;
-   database tests;
-   UI tests;
-   end-to-end tests;
-   security tests;
-   performance tests;
-   offline/synchronization tests;
-   file-format tests.

## 33.2 Critical End-to-End Flows

At minimum:

### E2E-001 Registration

Register -\> authenticate -\> create library -\> logout -\> login.

### E2E-002 Physical Book

Add book -\> mark physical -\> start session -\> update chapter -\> end
session -\> verify journal.

### E2E-003 Digital Book

Import EPUB -\> validate -\> open -\> read -\> close -\> reopen -\>
verify position.

### E2E-004 Physical to Digital Continuity

Physical reading -\> Chapter 10 recorded -\> open digital edition -\>
automatic navigation -\> verify mapped location.

### E2E-005 Digital to Physical

Digital progress -\> switch to physical -\> manually record progress -\>
verify unified reading journey.

### E2E-006 Annotation

Open book -\> highlight -\> create note -\> save quote -\> close -\>
reopen -\> verify annotation.

### E2E-007 Offline

Download -\> disconnect -\> read -\> annotate -\> reconnect -\>
synchronize -\> verify server state.

### E2E-008 Sync Conflict

Device A and Device B modify progress -\> reconnect -\> verify
deterministic conflict handling.

### E2E-009 Soundtrack

Open book -\> start soundtrack -\> read -\> pause/change soundtrack -\>
verify reading continues independently of music failures.

## 33.3 Automated API Testing

OpenAPI/Swagger-compatible endpoints should be automatically tested.

## 33.4 Browser E2E

A browser automation framework such as Playwright should be used for
critical web flows where applicable.

------------------------------------------------------------------------

# 34. Deployment and Environment Requirements

The system should maintain separate environments:

-   Development
-   Test/QA
-   Staging
-   Production

## 34.1 CI/CD

The project should implement:

``` text
Commit
  |
  v
Lint
  |
  v
Unit Tests
  |
  v
Build
  |
  v
Integration Tests
  |
  v
Security Checks
  |
  v
Deploy Staging
  |
  v
E2E Tests
  |
  v
Production
```

## 34.2 Configuration

Environment-specific configuration shall be externalised.

Secrets must not be committed to source control.

------------------------------------------------------------------------

# 35. Acceptance Criteria

The initial product shall be considered functionally acceptable when:

1.  A user can create and securely access an account.
2.  A user can create and maintain a personal book library.
3.  A user can distinguish works, editions, and copies.
4.  A user can add physical books.
5.  A user can import supported EPUB/PDF files.
6.  Imported books can be opened in the integrated reader.
7.  Reading progress persists correctly.
8.  Physical reading progress can be recorded manually.
9.  Reading sessions appear in a journal.
10. Notes, highlights, quotes, and reviews persist correctly.
11. Digital reading automatically records progress.
12. Physical and digital reading can contribute to the same reading
    journey.
13. Bunko can map a physical chapter/location to a digital location when
    sufficient information exists.
14. Users can correct incorrect mappings.
15. Data synchronizes across supported devices.
16. Downloaded books remain usable offline.
17. Offline progress and annotations synchronize after reconnection.
18. Users can configure reading soundtracks.
19. Music-provider failure does not prevent reading.
20. Basic reading statistics are accurate according to defined
    calculation rules.
21. Private user data is properly isolated.
22. Critical workflows pass automated end-to-end tests.
23. API documentation is available.
24. Production logging, monitoring, backups, and security controls are
    operational.

------------------------------------------------------------------------

# 36. MVP / Phase-Wise Delivery

The following is a recommended delivery sequence. Exact phase boundaries
may be adjusted by the implementation organisation without changing
product requirements.

## 36.1 MVP Definition

The MVP is defined as **Phases 1-5**. This is the smallest slice of
the product that proves Bunko's core differentiator: *one reading
journey across physical and digital formats* (Section 2.1). A product
that only tracks books or only reads EPUBs, without unifying the two,
does not validate the central product hypothesis and is not
considered a meaningful MVP for Bunko.

Phases 6-10 are explicitly deferred past MVP so that the team is not
tempted to build annotations, soundtrack, offline/sync, or AI before
the core continuity experience is proven with real users.

## 36.2 Delivery Tiers

  ------------------------------------------------------------------------
  Phase                              Tier              Rationale
  ----------------------------------- ----------------- ---------------------
  1. Foundation                       MVP               Required
                                                          infrastructure;
                                                          nothing ships
                                                          without it.

  2. Book Management                  MVP               A library with no
                                                          books is not a
                                                          product.

  3. Reading Tracking                 MVP               Journal/progress is
                                                          the second pillar
                                                          of the vision.

  4. Digital Reading                  MVP               Required so a
                                                          "digital edition"
                                                          exists to unify
                                                          with (Phase 5
                                                          depends on it).

  5. Unified Physical/Digital         MVP               The core
     Reading                                             differentiator
                                                          (Section 2.1);
                                                          without it Bunko is
                                                          just another
                                                          tracker.

  6. Annotations                      Fast-Follow       High value, but the
                                       (v1.1)             product is usable
                                                          and testable
                                                          without it; sessions
                                                          already carry basic
                                                          free-text notes
                                                          (12.2).

  7. Reviews and Reading Insights     Fast-Follow       Depends on having a
                                       (v1.1)             real usage history
                                                          from MVP users to
                                                          be meaningful.

  8. Soundtrack                       Future (v2+)      Differentiating but
                                                          non-core; carries
                                                          third-party
                                                          integration risk
                                                          (38.4) best
                                                          absorbed after core
                                                          product-market fit.

  9. Offline and Sync                 Future (v2+)      Significant
                                                          engineering cost
                                                          (conflict handling);
                                                          MVP may launch
                                                          single-device,
                                                          online-only.

  10. AI Layer                        Future (v2+)      Requires a
                                                          meaningful corpus
                                                          of real user notes
                                                          and sessions to be
                                                          useful at all;
                                                          premature before
                                                          Phases 1-7 exist.
  ------------------------------------------------------------------------

## 36.3 MVP Launch Acceptance Criteria

The MVP (Phases 1-5) shall not be considered launch-ready until all of
the following are demonstrably true:

-   A user can create an account, add a physical book, and add a
    digital book (EPUB or PDF) to their library.
-   A user can open an imported digital book in the in-app Reader and
    read it end-to-end.
-   A user can record a physical reading session (12.9) and see
    progress reflected in their library.
-   A user can read part of a work physically, then open a digital
    edition of the *same work*, and be offered a mapped location per
    the algorithm in 11.6-11.9, at confidence reporting per 11.4.
-   A user can view a chronological Journal (12.5) of all sessions
    across both formats.
-   All Phase 1-5 functionality meets the security, error-handling,
    and Definition of Done requirements in Sections 25, 30, and
    Appendix B.
-   No Phase 6-10 functionality is required for any of the above to
    work; the MVP is fully usable on its own.

## 36.4 Explicitly Out of MVP

The following are confirmed **not** required for MVP launch, regardless
of implementation convenience or partial availability:

-   Highlights, quotes, and dedicated annotation search (Phase 6).
-   Ratings, reviews, and derived reading analytics/trends (Phase 7).
-   Any music/soundtrack functionality (Phase 8).
-   Offline reading and multi-device sync/conflict resolution (Phase
    9). MVP may assume an online, primary-device usage pattern.
-   Any AI-powered feature (Phase 10).

If stakeholders wish to pull any of the above into MVP, this shall be
treated as a requirement change per the Requirement Change Policy at
the end of this document, since it changes the launch scope agreed
here.

## Phase 1 --- Foundation (MVP)

-   Project architecture
-   User authentication
-   User profile
-   Database
-   API foundation
-   Security foundation
-   CI/CD
-   Observability
-   Library foundation

## Phase 2 --- Book Management (MVP)

-   Works/books
-   Authors
-   Series
-   Editions
-   Copies
-   Metadata
-   Shelves
-   Tags
-   Search/filtering

## Phase 3 --- Reading Tracking (MVP)

-   Reading statuses
-   Reading journeys
-   Physical reading progress
-   Reading sessions
-   Journal
-   Reading statistics

## Phase 4 --- Digital Reading (MVP)

-   EPUB import
-   PDF import
-   Secure file storage
-   Reader
-   Automatic progress
-   Bookmarks
-   Reader settings

## Phase 5 --- Unified Physical/Digital Reading (MVP)

-   Canonical reading positions
-   Cross-edition mapping
-   Physical-to-digital continuation
-   Digital-to-physical continuation
-   Mapping confidence
-   Manual correction

This phase is a core Bunko differentiator.

## Phase 6 --- Annotations (Fast-Follow v1.1)

-   Highlights
-   Notes
-   Quotes
-   Page/chapter/passage association
-   Annotation search
-   Journal integration

## Phase 7 --- Reviews and Reading Insights (Fast-Follow v1.1)

-   Ratings
-   Reviews
-   Reading analytics
-   Trends
-   Streaks
-   Reading pace

## Phase 8 --- Soundtrack (Future v2+)

-   Playlist associations
-   Genre/mood mapping
-   Book-specific soundtrack
-   Music-provider integration
-   Reading soundtrack controls

## Phase 9 --- Offline and Sync (Future v2+)

-   Offline downloads
-   Offline reader
-   Offline annotations
-   Sync engine
-   Conflict handling
-   Device/session management

## Phase 10 --- AI Layer (Future v2+)

-   Personal reading assistant
-   Search across notes/quotes
-   Personal reading summaries
-   Reading pattern analysis
-   Personal recommendations
-   AI-generated insights

------------------------------------------------------------------------

# 37. Future Enhancements

Potential future capabilities include:

-   audiobook support;
-   public/private sharing;
-   social reading;
-   reading groups;
-   shared annotations;
-   book clubs;
-   advanced reading goals;
-   challenges;
-   achievements;
-   reading maps/timelines;
-   visual reading graphs;
-   advanced semantic search;
-   AI-generated book soundtrack plans;
-   adaptive chapter-level soundtrack;
-   multilingual reader features;
-   OCR for physical-book photographs;
-   camera-assisted page/ISBN recognition;
-   handwriting capture;
-   intelligent edition matching;
-   reading-data export;
-   import from other reading platforms.

These are not required for the baseline implementation unless separately
approved.

------------------------------------------------------------------------

# 38. Risks and Open Questions

## 38.1 Edition Mapping Accuracy

Mapping physical page/chapter positions to digital locations can be
difficult because editions may differ substantially.

**Mitigation:** canonical locations, text anchors, confidence scoring,
and user correction.

## 38.2 PDF Variability

PDFs may contain scanned pages, unusual layouts, missing text layers, or
inconsistent metadata.

**Mitigation:** PDF capability detection and graceful degradation.

## 38.3 EPUB Complexity

EPUB files may contain complex structures, scripts, fonts, embedded
media, or malformed content.

**Mitigation:** secure parsing, sandboxing where appropriate, strict
validation, and format-specific test suites.

## 38.4 Music Integration

Third-party music services may restrict background playback, API access,
or playlist control.

**Mitigation:** provider abstraction and graceful fallback.

## 38.5 AI Privacy

User notes and imported content can be highly personal.

**Mitigation:** explicit data-processing policy, consent controls,
encryption, minimal data exposure, and provider governance.

## 38.6 Storage Costs

Digital books can consume substantial storage.

**Mitigation:** quotas, object storage, lifecycle policies,
deduplication where legally and technically appropriate.

## 38.7 Product Complexity

Bunko could become too large if every proposed future feature is
implemented simultaneously.

**Mitigation:** maintain the book/reading/journal core and deliver
advanced features incrementally.

------------------------------------------------------------------------

# 39. Appendix A --- Example User Journeys

## A.1 Physical Book Journey

``` text
User opens Bunko
    |
Adds book
    |
Marks copy as Physical
    |
Starts reading
    |
Creates Reading Session
    |
Records Chapter 10
    |
Adds note
    |
Ends session
    |
Bunko stores:
    - progress
    - session
    - note
    - timestamp
```

## A.2 Digital Book Journey

``` text
User imports EPUB
    |
Bunko validates file
    |
Extracts metadata
    |
User confirms book
    |
Book added to library
    |
User opens Reader
    |
Reads Chapter 1-5
    |
Bunko automatically records progress
    |
User closes app
    |
Progress synchronized
```

## A.3 Physical -\> Digital Journey

``` text
Physical copy
    |
User reaches Chapter 10
    |
Records session
    |
Canonical position = Chapter 10
    |
Later opens EPUB
    |
Bunko resolves Chapter 10
    |
Reader navigates to mapped location
    |
User continues reading
```

## A.4 Digital -\> Physical Journey

``` text
Digital copy
    |
User reaches Chapter 15
    |
Progress automatically stored
    |
User switches to physical copy
    |
Bunko shows:
"Continue from Chapter 15"
    |
User manually confirms physical progress
    |
Unified reading journey continues
```

## A.5 Soundtrack Journey

``` text
User opens historical novel
    |
Bunko detects/uses:
Historical + Epic
    |
User's Historical playlist is associated
    |
User taps Start Soundtrack
    |
Music plays while reader is open
    |
User reads
    |
Music continues independently
    |
User can stop/change soundtrack at any time
```

## A.6 Annotation Journey

``` text
User reads digital book
    |
Highlights passage
    |
Selects "Save Quote"
    |
Adds personal note
    |
Bunko stores:
    Book
    Edition
    Chapter
    Location
    Text
    Note
    Timestamp
    |
Later:
User opens book
    |
Annotation appears at the relevant location
```

------------------------------------------------------------------------

# 40. Appendix B --- Definition of Done

A feature shall not be considered complete merely because the primary UI
works.

A feature is complete when:

-   requirements are implemented;
-   API contracts are documented;
-   validation is implemented;
-   authorisation is verified;
-   unit tests exist;
-   integration tests exist where appropriate;
-   UI tests exist where appropriate;
-   critical E2E flows pass;
-   error states are implemented;
-   loading states are implemented;
-   empty states are implemented;
-   offline behaviour is defined where relevant;
-   synchronization behaviour is defined where relevant;
-   observability is implemented;
-   security review is completed where applicable;
-   documentation is updated;
-   database migrations are versioned;
-   backward compatibility is considered;
-   performance is acceptable;
-   accessibility requirements are addressed;
-   production deployment is repeatable.

------------------------------------------------------------------------

# Final Product Definition

Bunko should ultimately be understood as:

> **A personal reading operating system that unifies physical books,
> digital books, reading progress, reading sessions, annotations,
> reviews, music, statistics, and eventually AI-powered understanding of
> the reader's personal literary journey.**

The defining product principle is:

> **One Book. Multiple Formats. One Reading Journey.**

And the broader promise is:

> **Don't just remember the books you read. Remember the experience of
> reading them.**

------------------------------------------------------------------------

## Requirement Change Policy

This SRS is the baseline product specification. Any material change to:

-   authentication;
-   privacy;
-   data ownership;
-   reading behaviour;
-   digital-file handling;
-   physical/digital continuity;
-   synchronization;
-   security;
-   external integrations;
-   AI data processing;

should be documented as a requirement change and reviewed before
implementation.
