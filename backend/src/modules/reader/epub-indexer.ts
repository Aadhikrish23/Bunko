import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
import { AppError } from '../../lib/app-error';
import type { ChapterGraph, ChapterUnit } from './chapter-graph';
import { generateTextAnchors, normalizeText } from './text-anchor';

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

// fast-xml-parser's output has no static shape (it mirrors whatever XML
// it's given) — `any` here is the honest type, not a shortcut.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type XmlNode = any;

// fast-xml-parser gives a bare object for a single child and an array for
// multiple — this normalises both to an array.
function asArray(value: XmlNode | XmlNode[] | undefined): XmlNode[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function dirname(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx);
}

function resolvePath(baseDir: string, relative: string): string {
  const stripped = relative.split('#')[0] ?? relative;
  if (!baseDir) return stripped;
  const segments = `${baseDir}/${stripped}`.split('/');
  const resolved: string[] = [];
  for (const segment of segments) {
    if (segment === '..') resolved.pop();
    else if (segment !== '.' && segment !== '') resolved.push(segment);
  }
  return resolved.join('/');
}

function stripHtml(xhtml: string): string {
  return xhtml
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

interface NavEntry {
  label: string;
  href: string; // resolved, without fragment
}

// Recursively flattens EPUB2 NCX <navPoint> nesting into reading order.
function flattenNcxNavPoints(navPoints: XmlNode, baseDir: string): NavEntry[] {
  const entries: NavEntry[] = [];
  for (const point of asArray(navPoints)) {
    const label = point?.['navLabel']?.['text'];
    const href = point?.['content']?.['@_src'];
    if (typeof label === 'string' && typeof href === 'string') {
      entries.push({ label, href: resolvePath(baseDir, href) });
    }
    if (point?.['navPoint']) {
      entries.push(...flattenNcxNavPoints(point['navPoint'], baseDir));
    }
  }
  return entries;
}

export function indexEpub(buffer: Buffer): ChapterGraph {
  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    throw new AppError('UNSUPPORTED_FILE', 'File is not a valid EPUB (not a readable ZIP archive)');
  }

  const containerEntry = zip.getEntry('META-INF/container.xml');
  if (!containerEntry) {
    throw new AppError('UNSUPPORTED_FILE', 'EPUB is missing META-INF/container.xml');
  }
  const container = xmlParser.parse(containerEntry.getData().toString('utf8'));
  const rootfilePath: string | undefined =
    container?.container?.rootfiles?.rootfile?.['@_full-path'] ??
    asArray(container?.container?.rootfiles?.rootfile)[0]?.['@_full-path'];
  if (!rootfilePath) {
    throw new AppError('UNSUPPORTED_FILE', 'EPUB container.xml has no rootfile');
  }

  const opfEntry = zip.getEntry(rootfilePath);
  if (!opfEntry) {
    throw new AppError('UNSUPPORTED_FILE', 'EPUB package document (OPF) not found');
  }
  const opf = xmlParser.parse(opfEntry.getData().toString('utf8'));
  const opfDir = dirname(rootfilePath);

  const manifestItems = asArray(opf?.package?.manifest?.item);
  const manifestById = new Map<string, { href: string; mediaType: string }>();
  for (const item of manifestItems) {
    const id = item?.['@_id'];
    const href = item?.['@_href'];
    if (id && href) {
      manifestById.set(id, { href: resolvePath(opfDir, href), mediaType: item['@_media-type'] ?? '' });
    }
  }

  const spineItems = asArray(opf?.package?.spine?.itemref);
  if (spineItems.length === 0) {
    throw new AppError('UNSUPPORTED_FILE', 'EPUB spine has no reading-order items');
  }

  // EPUB2: NCX referenced by manifest media-type. EPUB3 nav is not parsed
  // separately for MVP — spine order plus NCX labels (when present) is
  // sufficient; falls back to the manifest item id as the label otherwise.
  let navEntries: NavEntry[] = [];
  const ncxItem = manifestItems.find((item) => item['@_media-type'] === 'application/x-dtbncx+xml');
  if (ncxItem) {
    const ncxPath = resolvePath(opfDir, ncxItem['@_href']);
    const ncxEntry = zip.getEntry(ncxPath);
    if (ncxEntry) {
      const ncx = xmlParser.parse(ncxEntry.getData().toString('utf8'));
      navEntries = flattenNcxNavPoints(ncx?.ncx?.navMap?.navPoint, dirname(ncxPath));
    }
  }
  const labelByHref = new Map(navEntries.map((entry) => [entry.href, entry.label]));

  const units: ChapterUnit[] = spineItems.map((itemref, index) => {
    const idref: string = itemref['@_idref'];
    const manifestEntry = manifestById.get(idref);
    const href = manifestEntry?.href ?? idref;

    let text = '';
    if (manifestEntry) {
      const contentEntry = zip.getEntry(manifestEntry.href);
      if (contentEntry) {
        text = stripHtml(contentEntry.getData().toString('utf8'));
      }
    }
    const normalized = normalizeText(text);

    return {
      structuralId: idref,
      label: labelByHref.get(href) ?? idref,
      order: index,
      pageNumber: null, // EPUB has no native page numbers; continuity relies on structural/anchor matching
      textAnchors: generateTextAnchors(normalized),
      text: text.replace(/\s+/g, ' ').trim(),
    };
  });

  return { format: 'EPUB', units, hasTextLayer: true };
}
