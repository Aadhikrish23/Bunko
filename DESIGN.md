---
name: Bunko
description: A personal reading archive — calm paper-toned UI chrome around a genuinely physical virtual bookcase.
colors:
  paper-bg: "#FBF8F3"
  paper-surface: "#F4EEE3"
  paper-border: "#E8DFCF"
  paper-muted: "#B7A98A"
  paper-text-soft: "#5B5347"
  paper-text: "#26221D"
  moss-soft: "#D6E4D8"
  moss-accent: "#8FB08F"
  moss-primary: "#4F7A5C"
  moss-primary-hover: "#3E6249"
  moss-primary-active: "#2F4B38"
  ember-soft: "#C97B4A"
  ember-accent: "#B35F2E"
  ember-deep: "#93481F"
  oak-light: "#C9A877"
  oak-mid: "#9C6B3E"
  oak-dark: "#7A4E2B"
  oak-deepest: "#3B2417"
typography:
  display:
    fontFamily: "Lora, Georgia, serif"
    fontWeight: 500
    lineHeight: 1.2
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  control: "6px"
  surface: "12px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.moss-primary-hover}"
    textColor: "{colors.paper-bg}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.moss-primary-active}"
  button-secondary:
    backgroundColor: "{colors.paper-surface}"
    textColor: "{colors.paper-text}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.paper-text-soft}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.ember-accent}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.paper-bg}"
    rounded: "{rounded.surface}"
    padding: "20px"
  input:
    backgroundColor: "{colors.paper-bg}"
    textColor: "{colors.paper-text}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
---

# Design System: Bunko

## Overview

**Creative North Star: "Analog Library Realism"**

Bunko's interface is almost entirely a quiet, paper-toned room: flat surfaces, thin borders, restrained shadows, warm neutral tones standing in for stark white and gray (SRS §29.1 — calm, book-centric, not a tech-startup dashboard). Against that calm backdrop sits one deliberately different register — anything that represents an actual physical book (a spine on the Shelves bookcase, the 3D page-turn in the reader, the wood shelf itself) is rendered with real material conviction: spine hinge creases, gold foil bands, grain-textured wood, contact shadows, hover-lift. The split is the point. App chrome earns its calm by staying out of the way; book objects earn their realism because the book *is* the product. Nothing else in the system should borrow the bookcase's weight, and the bookcase should never flatten down to match the chrome around it.

This is explicitly not a gamified tracker (SRS §2.3, §6: "delightful rather than overly gamified") and explicitly not a generic SaaS dashboard — no glassy panels, gradient-mesh backgrounds, neon accent glows, or badge/streak/leaderboard furniture. Icons stay thin-line (Lucide, ~1.5–1.75 stroke), never filled or duotone, keeping the whole surface feeling drawn rather than branded.

**Key Characteristics:**
- Warm paper-neutral base, one muted forest-green accent (moss), a warm ember accent used sparingly for danger/attention, and an oak-wood family reserved for the Shelves bookcase only.
- Flat-by-default UI chrome: subtle `shadow-card`, 1px borders, no heavy elevation anywhere except the bookcase.
- The bookcase and the reader's 3D page-turn are the system's one deliberate region of physical, dimensional realism — named rule below.
- Lora (serif, display) for every heading and book title; Inter (sans, body) for everything else.
- Thin-line Lucide iconography throughout; no filled icon sets.

## Colors

A single warm neutral scale carries almost every surface; one accent (moss) does almost all of the color work; ember and oak are used narrowly and on purpose.

### Primary
- **Muted Forest Moss** (`#4F7A5C` base / `#3E6249` button fill / `#2F4B38` active): the one true accent. Primary actions, active nav state, focus rings. Used sparingly enough that its appearance always means "this is the one thing to do here."

### Secondary
- **Burnt Ember Clay** (`#B35F2E` / soft `#C97B4A` / deep `#93481F`): warm, not alarming. Carries danger/error state (buttons, input error text/border) and small attention accents (saved-quote marks, ratings). Deliberately never a cold red — errors stay inside the same warm family as everything else.

### Tertiary
- **Aged Oak** (`#C9A877` light / `#9C6B3E` mid / `#7A4E2B` dark / `#3B2417` deepest): Shelves-view only. Bookcase frame, shelf plank, shelf-back recess, rack labels. Never appears outside the bookcase — if a future screen needs wood tones, that's a signal it's trying to BE a bookcase, not borrow its palette.

### Neutral
- **Warm Paper** (`#FBF8F3` bg → `#F4EEE3` surface → `#E8DFCF` border → `#B7A98A` muted → `#5B5347` soft text → `#26221D` text): the base everything sits on. `paper-50` is the page background and default card fill; `paper-900` is primary text. No pure white, no pure black, anywhere in the chrome.

### Reader surface themes (separate, user-selected sub-palette)
The in-reader page surface has its own four themes the reader picks explicitly (Paper / Sepia / Charcoal / Dark) — a related but distinct token set from the app-chrome neutrals above (the reader's "paper" theme bg `#F5F2EB` is warmer/darker than chrome `paper-50`, by design — it's meant to read as an actual page, not a UI panel). Treat these as reader-content tokens, not candidates for reuse in app chrome.

### Named Rules
**The No True Red Rule.** Danger and error states use ember, never a cold/saturated red. Mistakes stay inside the book-room's warm palette instead of injecting an alarm color that doesn't belong to the world.

**The Oak Containment Rule.** Oak/wood tones exist only inside the Shelves bookcase. Any other screen reaching for wood tones is reaching for the wrong rule — use moss or paper instead.

## Typography

**Display Font:** Lora (serif), with Georgia/serif fallback
**Body Font:** Inter (sans), with system-ui/sans-serif fallback

**Character:** A literary serif for anything that names a book, a person, or a heading, against a plain, highly legible sans for everything functional (labels, body copy, controls). The pairing reads "bookshop signage over a well-run back office," never decorative.

### Hierarchy
- **Display** (Lora, 500–600 weight, text-lg to text-xl): book titles, modal/page headings, chapter labels. Always `font-display`.
- **Title** (Lora, 500, text-lg): section headers, card titles, empty-state headings.
- **Body** (Inter, 400, text-sm to text-base): all functional copy — forms, lists, descriptions, nav labels.
- **Label** (Inter, 500, text-xs to text-sm): form labels, badges, metadata captions (author, language, page counts).

### Named Rules
**The Serif-Names-It Rule.** Lora appears only on things that are titles or identify a specific book/person/heading — never on a button, a form label, or a metadata caption. If it's naming something, it's Lora; if it's operating something, it's Inter.

## Layout

Persistent 240px (`w-60`) left sidebar on desktop; a sticky top header plus fixed bottom tab bar on mobile (`md:` breakpoint switch), both using a slightly tinted `paper-100/90` with backdrop-blur rather than a hard-edged bar. Main content sits in a centered container capped at `max-w-7xl`, expanding further on very large screens (`2xl:max-w-[1750px]`, `3xl:max-w-[2200px]`) rather than staying narrow on widescreen monitors. Page padding scales from `px-4 py-6` on mobile to `px-8 py-8` on desktop. Spacing throughout uses the default Tailwind numeric scale (no custom spacing tokens defined) — control padding sits around `px-3 py-2`/`px-4 py-2`, section padding around `px-5 py-4`, nav rhythm at `gap-1`–`gap-3`.

The Shelves bookcase breaks from the page-container model: it's a full-bleed stage of stacked shelf rows, each a horizontally-scrolling rack of upright spines standing on a plank, not a grid of cards.

## Elevation & Depth

Two distinct elevation systems coexist on purpose (see the Overview's North Star).

**App chrome is flat-by-default.** Cards and modals use one subtle shadow (`shadow-card`: `0 1px 2px rgba(38,34,29,0.06), 0 4px 12px rgba(38,34,29,0.05)`) plus a 1px `paper-200` border — depth is suggested, not performed. Buttons and inputs carry no shadow at rest.

**Book objects are physically dimensional.** A shelved book cover lifts and deepens its shadow on hover (`shadow-[0_4px_6px_...] → shadow-[0_10px_16px_...]` with a `-translate-y-2`); a spine-mode book adds inset highlight/shadow rules simulating a rounded spine edge plus its own drop shadow; the shelf plank gets its own `shadow-plank` (`0 3px 6px rgba(59,36,23,0.35)`); the reader's 3D page-turn animates real perspective (`rotateY` + `translateZ` + a traveling cast-shadow pulse) rather than a flat opacity-crossfade.

### Shadow Vocabulary
- **`shadow-card`** (`0 1px 2px rgba(38,34,29,0.06), 0 4px 12px rgba(38,34,29,0.05)`): default for every flat surface — cards, modals, dropdown panels.
- **`shadow-plank`** (`0 3px 6px rgba(59,36,23,0.35)`): the shelf plank edge only.
- **Book hover-lift** (`0_4px_6px_-1px_rgba(0,0,0,0.45)` at rest → `0_10px_16px_-3px_rgba(0,0,0,0.6)` on hover): shelved book covers/spines only.

### Named Rules
**The Flat-Chrome, Dimensional-Books Rule.** If it's a UI control or container, it stays flat (`shadow-card` or nothing). If it's a representation of a physical book or shelf, it's allowed real shadow, perspective, and hover-lift. Never move a UI panel toward book-level depth, and never flatten a book object down to chrome-level restraint.

## Shapes

Two radius steps cover nearly everything: **6px** (`rounded-md`) for interactive controls — buttons, inputs, nav items, icon buttons — and **12px** (`rounded-xl`) for containing surfaces — cards, modals, empty states, dropdown panels. Mobile bottom-nav pills use `rounded-lg` (8px); avatars, bookmark-remove buttons, and the loading spinner use full `rounded-full`. Borders are consistently 1px, `paper-200`/`paper-300`.

Book objects get their own shape language: covers use an asymmetric `rounded-r-[3px] rounded-l-[1px]` (a hinge-side crease vs. a page-edge corner — real book geometry, not a uniform rounded rectangle); spines use `rounded-t-[3px] rounded-b-[2px]`; the shelf plank uses `rounded-t-sm`/`rounded-b-sm`.

## Components

### Buttons
- **Shape:** `rounded-md` (6px), `px-4 py-2` (md) or `px-3 py-1.5` (sm), `text-sm font-medium`.
- **Primary:** moss-600 fill, paper-50 text, hover → moss-700, disabled → moss-300.
- **Secondary:** paper-100 fill, paper-900 text, paper-300 border, hover → paper-200.
- **Ghost:** transparent, paper-700 text, hover → paper-100 fill.
- **Danger:** transparent, ember-600 text, ember-500/40 border, hover → ember-500/10 fill. (Never red — see The No True Red Rule.)
- All variants share one focus ring (`ring-2 ring-moss-500 ring-offset-2 ring-offset-paper-50`) and a built-in loading spinner (a borrowed-currentColor spin ring, no separate asset).

### Cards / Containers
- **Corner Style:** `rounded-xl` (12px).
- **Background:** paper-50, `paper-200` border.
- **Shadow Strategy:** `shadow-card` only — see Elevation.

### Inputs / Fields
- **Style:** paper-50 fill, `paper-300` border, `rounded-md`, `px-3 py-2`, `text-sm`.
- **Focus:** the shared focus-ring utility (moss ring).
- **Error:** border switches to `ember-500`; helper text in `ember-600` below the field. Never a red border.

### Navigation
- **Desktop sidebar (240px):** Lora wordmark + icon at top; stacked nav items with `gap-3`, `rounded-md`, active state = `moss-100` fill + `moss-700` text, inactive = `paper-700` text with `paper-200/70` hover.
- **Mobile:** sticky top header (logo + user + sign-out) plus a fixed bottom tab bar, both `paper-100/90`–`95` with backdrop-blur; active tab = bold `moss-700` text.

### The Bookcase (signature component)
A full material departure from the rest of the system, by design. A dark, grain-textured `shelf-back` recess (`#3f2a19` with a radial top-light falloff) holds a horizontal row of upright books; each tier sits on a lighter wood-grain `plank` (`#8a5f36`→`#5e3d20` gradient) with its own drop shadow. Books render in **cover mode** (real cover art or a cloth-hardcover fallback with centered serif title/author and an inset vignette) or **spine mode** (a fully synthetic spine graphic: gold foil top/bottom bands, vertical serif title that shrinks with length, a deterministic per-book hue/tilt so a shelf of placeholder books still reads as varied, not templated). Both modes lift and deepen their shadow on hover and support drag-to-reorder with a glowing oak insertion marker. This is the one place in Bunko allowed to look handcrafted rather than systemized — new signature surfaces (if any) should earn that same exception deliberately, not inherit it by default.

## Do's and Don'ts

### Do:
- **Do** keep every UI control flat — `shadow-card` or nothing, never a bespoke heavier shadow on a button/input/card.
- **Do** reserve Lora for things that name a book, person, or section; everything functional stays Inter.
- **Do** use ember (never red) for every danger/error state.
- **Do** let book-representing objects (spines, covers, the shelf, the reader's page-turn) be as physically dimensional as they want — that's the one place depth and motion are earned.
- **Do** keep icons thin-line Lucide (~1.5–1.75 stroke); no filled or duotone icon sets.

### Don't:
- **Don't** introduce glassy panels, gradient-mesh backgrounds, or neon glow accents — no generic SaaS-dashboard gloss.
- **Don't** add streaks, badges, leaderboards, or other gamification furniture (SRS §2.3 — delightful, not gamified).
- **Don't** let oak/wood tones leak outside the Shelves bookcase.
- **Don't** give an ordinary UI panel bookcase-level shadow depth, or flatten the bookcase down to chrome-level restraint.
