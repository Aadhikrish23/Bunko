// Page layout for the flow reader, measured rather than estimated: each chapter's paragraphs
// are laid out in an offscreen copy of the page's text box and cut where they stop fitting,
// so a page is as full as it can be and nothing is ever clipped. Every piece of text on a
// page keeps its character offsets in the chapter, which is what highlights, "where was I"
// and the time-left estimate work from.

export interface Paragraph {
  text: string;
  /** Offset of the paragraph's first character in the chapter text. */
  start: number;
}

export interface PageFragment {
  text: string;
  start: number;
  end: number;
  /** The paragraph began on an earlier page. */
  continued: boolean;
}

export interface LaidOutPage {
  fragments: PageFragment[];
  /** Chapter offset where the page starts (its first fragment's start). */
  start: number;
}

/** Paragraphs are separated by a blank line; offsets point into the original text. */
export function splitParagraphs(text: string): Paragraph[] {
  const out: Paragraph[] = [];
  const push = (raw: string, at: number) => {
    const lead = raw.length - raw.trimStart().length;
    const body = raw.trim();
    if (body) out.push({ text: body, start: at + lead });
  };
  const separator = /\n[ \t]*(?:\n[ \t]*)+/g;
  let last = 0;
  for (let m = separator.exec(text); m; m = separator.exec(text)) {
    push(text.slice(last, m.index), last);
    last = m.index + m[0].length;
  }
  push(text.slice(last), last);
  return out;
}

/** Where a saved passage sits in the chapter, forgiving line breaks and spacing; null when it doesn't. */
export function findPassage(chapterText: string, passage: string): { start: number; end: number } | null {
  const words = passage.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const pattern = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
  const match = new RegExp(pattern).exec(chapterText);
  return match ? { start: match.index, end: match.index + match[0].length } : null;
}

export interface Mark {
  start: number;
  end: number;
  color: string;
  id: string;
}

/** A fragment cut into plain and highlighted runs. */
export function segmentFragment(fragment: PageFragment, marks: Mark[]): { text: string; mark: Mark | null }[] {
  const inside = marks
    .filter((m) => m.end > fragment.start && m.start < fragment.end)
    .sort((a, b) => a.start - b.start);
  const runs: { text: string; mark: Mark | null }[] = [];
  let at = fragment.start;
  for (const mark of inside) {
    const from = Math.max(mark.start, at);
    const to = Math.min(mark.end, fragment.end);
    if (to <= from) continue;
    if (from > at) runs.push({ text: fragment.text.slice(at - fragment.start, from - fragment.start), mark: null });
    runs.push({ text: fragment.text.slice(from - fragment.start, to - fragment.start), mark });
    at = to;
  }
  if (at < fragment.end) runs.push({ text: fragment.text.slice(at - fragment.start), mark: null });
  return runs;
}

/** The page holding a chapter offset: the last page that starts at or before it. */
export function pageForOffset(pageStarts: number[], offset: number): number {
  let found = 0;
  pageStarts.forEach((start, i) => {
    if (start <= offset) found = i;
  });
  return found;
}

export interface PageBoxStyle {
  width: number;
  height: number;
  fontFamily: string;
  fontSize: string;
  lineHeight: number;
  /** Space between paragraphs, CSS length. */
  gap: string;
}

/**
 * The offscreen text box. Callers pass the same styles the page renders with; `heading` builds
 * the elements a chapter's first page starts with (title, translation label).
 */
export function createMeasurer(box: PageBoxStyle) {
  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'absolute',
    left: '-100000px',
    top: '0',
    visibility: 'hidden',
    width: `${box.width}px`,
    display: 'flex',
    flexDirection: 'column',
    gap: box.gap,
    fontFamily: box.fontFamily,
    fontSize: box.fontSize,
    lineHeight: String(box.lineHeight),
  });
  document.body.appendChild(el);
  const limit = box.height;
  const fits = () => el.scrollHeight <= limit;

  function paragraph(text: string): HTMLParagraphElement {
    const p = document.createElement('p');
    p.style.whiteSpace = 'pre-line';
    p.textContent = text;
    el.appendChild(p);
    return p;
  }

  function layoutChapter(text: string, heading: () => HTMLElement[]): LaidOutPage[] {
    const pages: LaidOutPage[] = [];
    let current: PageFragment[] = [];
    const startPage = (first: boolean) => {
      el.replaceChildren(...(first ? heading() : []));
      current = [];
    };
    const finishPage = () => {
      pages.push({ fragments: current, start: current[0]?.start ?? pages.at(-1)?.start ?? 0 });
    };
    startPage(true);

    for (const para of splitParagraphs(text)) {
      let from = 0;
      let continued = false;
      let tokens: { index: number; end: number }[] | null = null;
      for (;;) {
        const rest = para.text.slice(from);
        const p = paragraph(rest);
        if (fits()) {
          current.push({ text: rest, start: para.start + from, end: para.start + para.text.length, continued });
          break;
        }
        tokens ??= [...para.text.matchAll(/\S+/g)].map((m) => ({ index: m.index!, end: m.index! + m[0].length }));
        const first = tokens.findIndex((t) => t.index >= from);
        // The most words of what's left that still fit.
        let lo = 0;
        let hi = tokens.length - first - 1;
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2);
          p.textContent = para.text.slice(from, tokens[first + mid - 1]!.end);
          if (fits()) lo = mid;
          else hi = mid - 1;
        }
        if (lo === 0 && current.length > 0) {
          p.remove();
          finishPage();
          startPage(false);
          continue;
        }
        const take = Math.max(1, lo);
        const cut = tokens[first + take - 1]!.end;
        p.textContent = para.text.slice(from, cut);
        current.push({ text: para.text.slice(from, cut), start: para.start + from, end: para.start + cut, continued });
        finishPage();
        startPage(false);
        if (first + take >= tokens.length) break;
        from = tokens[first + take]!.index;
        continued = true;
      }
    }
    if (current.length > 0 || pages.length === 0) finishPage();
    return pages;
  }

  return { layoutChapter, dispose: () => el.remove() };
}
