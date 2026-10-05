---
target: shelves
total_score: 21
max_score: 36
na_heuristics: 10
p0_count: 1
p1_count: 3
target_identity: "file:E:\\Bunko\\frontend\\src\\features\\shelves"
timestamp: 2026-10-02T03-23-43Z
slug: frontend-src-features-shelves
---
# Shelves Design Critique

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Delete-shelf switches activeTabId before success/failure is known. |
| 2 | Match Between System and Real World | 3 | "Filter this rack" placeholder filters the whole tab, not the visual rack. |
| 3 | User Control and Freedom | 2 | Keyboard reorder buttons unreachable by forward-Tab (verified live). |
| 4 | Consistency and Standards | 2 | Shelf deletion uses native confirm(), breaking the app's own modal pattern. |
| 5 | Error Prevention | 2 | Remove-from-shelf fires instantly with no confirmation. |
| 6 | Recognition Rather Than Recall | 2 | Move/remove controls are icon-only, hidden until hover/focus. |
| 7 | Flexibility and Efficiency of Use | 2 | No move-to-start/end, no bulk reorder, one slot at a time only. |
| 8 | Aesthetic and Minimalist Design | 3 | Plaque header is dense: title+count+delete+toggle+search in one row. |
| 9 | Error Recovery | 2 | Delete-shelf failures surface nothing to the user. |
| 10 | Help and Documentation | n/a | Proportionate for a personal shelf tool; not applicable. |
| Total | | 21/36 | Acceptable |

## Design Specificity Verdict
Strongly specific. chunkWorks() sizes racks differently per view mode, spine-style.ts hashes work IDs into deterministic color/height/tilt, copy commits to the metaphor. DESIGN.md's flat-chrome/dimensional-book-object split is faithfully executed in code. Detector: zero findings (clean).

## Priority Issues
- [P0] Keyboard reorder path unreachable by forward-Tab. Move buttons are display:none until :focus-within, so a user tabbing in lands on "Open book" first; reaching Move-left/right requires Shift+Tab backward. Verified live via DOM query. Fix: reorder JSX so move buttons come after the open button in DOM order. Suggested: /impeccable harden
- [P1] Touch users likely cannot reorder at all. Move/Remove are hover/focus-reveal only, no tap affordance; native HTML5 drag-and-drop doesn't work on touch. Fix: persistent controls at narrow viewports or an arrange mode. Suggested: /impeccable adapt
- [P1] group-works.ts (series/genre grouping with labels) exists and is never imported; chunkWorks() only slices by raw count, producing unlabeled racks on large shelves. Fix: wire groupWorksForShelf into ShelvesPage/ShelfRow. Suggested: /impeccable layout
- [P1] Shelf order persists to localStorage only, never the backend - silently device-local despite Bunko being multi-device. Fix: persist via API, localStorage as optimistic cache only. Suggested: /impeccable harden
- [P2] Shelf deletion: tab switches before success is known, failures surface nothing, confirmation is a raw confirm() breaking the app's custom-modal pattern. Fix: gate on onSuccess, use ErrorBanner, replace confirm() with the app's modal. Suggested: /impeccable polish
- [P3] Spine metadata text (language code, Pt/Ch badges) shrinks to 7.5-8.5px, likely below readable size. Fix: minimum readable floor independent of title length. Suggested: /impeccable typeset

## Persona Red Flags
Sam (Accessibility): forward-Tab can't reach move buttons (verified); delete uses native confirm(); 7.5px fixed-px metadata text.
Casey (Mobile): drag-and-drop doesn't work on touch; move/remove hover-only with no tap affordance; nested horizontal scrollers inside vertical scroll.

## Minor Observations
- wood-* tokens implement DESIGN.md's "oak" family correctly but with a naming mismatch.
- Shelf-tab row has a fade-mask scroll cue but no explicit scroll affordance for desktop mouse users.
- ShelfRow's onDeleteShelf and label props are wired but never given values from ShelvesPage.
- New-shelf input opens near the page title, not near the bookcase it affects.
- reorderedMap (state) and localStorage order coexist via fallback chain with no reconciliation.

## Questions to Consider
- Was series/genre grouping dropped as a product decision, or lost in the shuffle?
- Does "my bookcase" survive as a mental model when arrangement doesn't follow across devices?
- Should touch-first reordering have been the default rather than a bolted-on fallback?
