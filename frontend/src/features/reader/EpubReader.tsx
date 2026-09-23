import ePub from 'epubjs';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { PageSpinner } from '../../components/ui/Spinner';

// epubjs ships no usable TypeScript types for Book/Rendition — `any` is
// the honest type here, matching the same pragmatic pattern used on the
// backend for pdfjs-dist.
import type { SearchMatch } from './InBookSearchDrawer';
import type { MarginSize, ReaderSettings } from './reader-settings';
import { THEME_STYLES } from './reader-settings';

function getReaderGap(isCover: boolean, isSmallScreen: boolean, marginSize?: MarginSize): number {
  if (isCover) return 0;
  if (isSmallScreen) {
    return marginSize === 'compact' ? 36 : marginSize === 'wide' ? 64 : 48;
  }
  // Dual-page spread on desktop: gap provides outer left margin (gap/2),
  // center spine gutter gap (gap), and outer right margin (gap/2)
  return marginSize === 'compact' ? 72 : marginSize === 'wide' ? 112 : 92;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EpubAny = any;

export interface EpubTocItem {
  label: string;
  href: string;
  idref?: string;
}

interface EpubReaderProps {
  fileUrl: string;
  startPosition: string | null;
  jumpToPosition: string | null;
  fontScale?: number;
  settings?: ReaderSettings;
  onPositionChange: (position: string) => void;
  onTocLoaded?: (toc: EpubTocItem[]) => void;
  onRegisterSearch?: (searchFn: (query: string) => Promise<SearchMatch[]>) => void;
  onTextSelected?: (selection: { text: string; x: number; y: number; position: string }) => void;
  onFlipStart?: (direction: 'next' | 'prev') => void;
  onCoverChange?: (isCover: boolean) => void;
}

// In-memory ArrayBuffer cache to eliminate repeated network fetches and make rendering instant
const epubBufferCache = new Map<string, Promise<ArrayBuffer>>();

function getEpubBuffer(url: string): Promise<ArrayBuffer> {
  const cached = epubBufferCache.get(url);
  if (cached) return cached;
  const promise = fetch(url).then((res) => {
    if (!res.ok) throw new Error(`Failed to load EPUB file: HTTP ${res.status}`);
    return res.arrayBuffer();
  });
  epubBufferCache.set(url, promise);
  return promise;
}

export function EpubReader({
  fileUrl,
  startPosition,
  jumpToPosition,
  fontScale = 1.0,
  settings,
  onPositionChange,
  onTocLoaded,
  onRegisterSearch,
  onTextSelected,
  onFlipStart,
  onCoverChange,
}: EpubReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<EpubAny>(null);
  const renditionRef = useRef<EpubAny>(null);
  const onPositionChangeRef = useRef(onPositionChange);
  onPositionChangeRef.current = onPositionChange;
  const onCoverChangeRef = useRef(onCoverChange);
  onCoverChangeRef.current = onCoverChange;

  const [isLoading, setIsLoading] = useState(true);
  const [isCover, setIsCover] = useState(() => {
    if (!startPosition) return true;
    return startPosition === '0' || startPosition === '1';
  });
  const [error, setError] = useState<string | null>(null);

  const effectiveFontScale = settings?.fontScale ?? fontScale;

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!renditionRef.current) return;
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        onFlipStart?.('prev');
        try {
          renditionRef.current.prev();
        } catch {
          // ignore
        }
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        onFlipStart?.('next');
        try {
          renditionRef.current.next();
        } catch {
          // ignore
        }
      } else if (e.key === 'Home') {
        onFlipStart?.('prev');
        try {
          renditionRef.current.display(0);
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    const resolvedUrl =
      typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
        ? fileUrl.replace('localhost:9000', `${window.location.hostname}:9000`).replace('127.0.0.1:9000', `${window.location.hostname}:9000`)
        : fileUrl;

    getEpubBuffer(resolvedUrl)
      .then((arrayBuffer) => {
        if (cancelled || !containerRef.current) return;

        const book = ePub(arrayBuffer);
        bookRef.current = book;

        const initialFlow = settings?.pageTurnMode === 'continuous' ? 'scrolled' : 'paginated';
        const isSmallScreen = typeof window !== 'undefined' && window.innerWidth < 768;
        const initialSpread =
          isCover || isSmallScreen || settings?.pageTurnMode === 'continuous' || settings?.pageTurnMode === 'paginated' ? 'none' : 'always';

        const rendition = book.renderTo(containerRef.current, {
          width: '100%',
          height: '100%',
          flow: initialFlow,
          spread: initialSpread,
          minSpreadWidth: 0,
          gap: getReaderGap(isCover, isSmallScreen, settings?.marginSize),
        } as EpubAny);
        renditionRef.current = rendition;

        rendition.hooks.content.register((contents: EpubAny) => {
          const doc = contents.document as Document;
          if (!doc) return;
          const isCoverDoc = Boolean(
            doc.querySelector('p.cover, .cover, #cover') ||
            doc.body?.classList?.contains('cover') ||
            contents.section?.href?.toLowerCase().includes('cover') ||
            contents.section?.idref?.toLowerCase().includes('cover')
          );

          if (isCoverDoc) {
            const style = doc.createElement('style');
            style.id = 'bunko-cover-override';
            style.innerHTML = `
              html, body {
                margin: 0 !important;
                padding: 0 !important;
                width: 100% !important;
                height: 100% !important;
                overflow: hidden !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                column-width: auto !important;
                column-gap: 0 !important;
              }
              p, p.cover, .cover, #cover, div, section {
                margin: 0 !important;
                padding: 0 !important;
                width: 100% !important;
                height: 100% !important;
                max-width: 100% !important;
                max-height: 100% !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
              }
              img, image, svg {
                width: 100% !important;
                height: 100% !important;
                max-width: 100% !important;
                max-height: 100% !important;
                object-fit: fill !important;
                display: block !important;
                margin: 0 !important;
                padding: 0 !important;
              }
            `;
            doc.head.appendChild(style);

            const img = doc.querySelector('img, image') as HTMLElement | null;
            if (img) {
              img.style.setProperty('width', '100%', 'important');
              img.style.setProperty('height', '100%', 'important');
              img.style.setProperty('max-width', '100%', 'important');
              img.style.setProperty('max-height', '100%', 'important');
              img.style.setProperty('object-fit', 'fill', 'important');
              img.style.setProperty('margin', '0', 'important');
              img.style.setProperty('padding', '0', 'important');
            }
            if (doc.body) {
              doc.body.style.setProperty('padding', '0px', 'important');
              doc.body.style.setProperty('padding-left', '0px', 'important');
              doc.body.style.setProperty('padding-right', '0px', 'important');
              doc.body.style.setProperty('padding-top', '0px', 'important');
              doc.body.style.setProperty('padding-bottom', '0px', 'important');
              doc.body.style.setProperty('margin', '0px', 'important');
              doc.body.style.setProperty('column-width', 'auto', 'important');
              doc.body.style.setProperty('column-gap', '0px', 'important');
            }
          }
        });

        rendition.on('rendered', (section: EpubAny, view: EpubAny) => {
          const doc = (view?.document || renditionRef.current?.manager?.container?.querySelector('iframe')?.contentDocument) as Document | undefined;
          if (!doc) return;
          const isCoverDoc = Boolean(
            doc.querySelector('p.cover, .cover, #cover') ||
            doc.body?.classList?.contains('cover') ||
            section?.href?.toLowerCase().includes('cover') ||
            section?.idref?.toLowerCase().includes('cover')
          );
          if (isCoverDoc && doc.body) {
            doc.body.style.setProperty('padding', '0px', 'important');
            doc.body.style.setProperty('padding-left', '0px', 'important');
            doc.body.style.setProperty('padding-right', '0px', 'important');
            doc.body.style.setProperty('padding-top', '0px', 'important');
            doc.body.style.setProperty('padding-bottom', '0px', 'important');
            doc.body.style.setProperty('margin', '0px', 'important');
            doc.body.style.setProperty('column-gap', '0px', 'important');
            doc.body.style.setProperty('column-width', 'auto', 'important');
            const img = doc.querySelector('img, image') as HTMLElement | null;
            if (img) {
              img.style.setProperty('width', '100%', 'important');
              img.style.setProperty('height', '100%', 'important');
              img.style.setProperty('max-width', '100%', 'important');
              img.style.setProperty('max-height', '100%', 'important');
              img.style.setProperty('object-fit', 'fill', 'important');
              img.style.setProperty('margin', '0', 'important');
              img.style.setProperty('padding', '0', 'important');
            }
          }
        });

        rendition.on('relocated', (location: EpubAny) => {
          const href: string = location?.start?.href;
          const cfi: string = location?.start?.cfi;
          const spineItem = href ? book.spine.get(href) : null;
          const pos = cfi || spineItem?.idref || href;
          if (pos) {
            onPositionChangeRef.current(pos);
          }

          // Dynamic cover detection
          const isAtStart = Boolean(location?.atStart || location?.start?.index === 0);
          const isCoverItem = Boolean(
            spineItem?.properties?.includes('cover') ||
            spineItem?.idref?.toLowerCase().includes('cover') ||
            spineItem?.href?.toLowerCase().includes('cover') ||
            spineItem?.idref?.toLowerCase().includes('titlepage') ||
            spineItem?.href?.toLowerCase().includes('titlepage')
          );
          const isCoverPage = isAtStart && (isCoverItem || location?.start?.index === 0);
          setIsCover(Boolean(isCoverPage));

          if (settings?.pageTurnMode === '3d-flip' || !settings?.pageTurnMode) {
            try {
              const isSmall = typeof window !== 'undefined' && window.innerWidth < 768;
              if (isCoverPage || isSmall) {
                rendition.spread('none', 0);
              } else {
                rendition.spread('always', 0);
              }
            } catch {
              // ignore
            }
          }
          onCoverChangeRef.current?.(Boolean(isCoverPage));
        });

        // Handle text selection inside EPUB iframe
        rendition.on('selected', (cfiRange: string, contents: EpubAny) => {
          if (!onTextSelected) return;
          const text = contents.window?.getSelection()?.toString()?.trim();
          if (text && text.length > 0) {
            onTextSelected({
              text,
              x: window.innerWidth / 2,
              y: window.innerHeight / 2 - 40,
              position: cfiRange,
            });
          }
        });

        rendition.on('keydown', handleKeyDown);

        book.loaded.navigation
          .then((nav: EpubAny) => {
            if (nav?.toc && Array.isArray(nav.toc) && onTocLoaded) {
              const items: EpubTocItem[] = nav.toc.map((item: EpubAny) => {
                const href = item.href ?? '';
                const spineItem = href ? book.spine.get(href) : null;
                return {
                  label: (item.label || 'Chapter').trim(),
                  href,
                  idref: spineItem?.idref,
                };
              });
              onTocLoaded(items);
            }
          })
          .catch(() => {});

        // Register full-text search callback for EPUB
        if (onRegisterSearch) {
          onRegisterSearch(async (query: string): Promise<SearchMatch[]> => {
            if (!bookRef.current) return [];
            const results: SearchMatch[] = [];
            const q = query.toLowerCase();

            await bookRef.current.ready;
            const spine = bookRef.current.spine;
            if (!spine?.spineItems) return [];

            for (let i = 0; i < spine.spineItems.length; i++) {
              const item = spine.spineItems[i];
              try {
                await item.load(bookRef.current.load.bind(bookRef.current));
                const doc = item.document as Document;
                if (doc && doc.body) {
                  const text = doc.body.textContent || '';
                  let pos = text.toLowerCase().indexOf(q);
                  let count = 0;
                  while (pos !== -1 && count < 5) {
                    const start = Math.max(0, pos - 40);
                    const end = Math.min(text.length, pos + q.length + 40);
                    const snippet = text.slice(start, end).replace(/\s+/g, ' ');

                    results.push({
                      id: `${item.idref || i}-${pos}`,
                      target: item.idref || item.href,
                      snippet: `...${snippet}...`,
                      chapterLabel: `Section ${i + 1}`,
                    });

                    pos = text.toLowerCase().indexOf(q, pos + q.length);
                    count++;
                  }
                }
              } catch {
                // Ignore individual item load error
              }
            }
            return results;
          });
        }

        return book.ready
          .then(async () => {
            let target: string | undefined = undefined;
            if (startPosition) {
              if (startPosition.startsWith('epubcfi(')) {
                target = startPosition;
              } else {
                const spineItem = book.spine.get(startPosition);
                if (spineItem?.href) {
                  target = spineItem.href;
                }
              }
            }
            try {
              const sec: EpubAny = await rendition.display(target);
              const isAtStart = !target || sec?.index === 0;
              const isCoverItem = Boolean(
                sec?.properties?.includes('cover') ||
                sec?.idref?.toLowerCase().includes('cover') ||
                sec?.href?.toLowerCase().includes('cover') ||
                sec?.idref?.toLowerCase().includes('titlepage') ||
                sec?.href?.toLowerCase().includes('titlepage')
              );
              const isCoverPage = isAtStart && (isCoverItem || sec?.index === 0);
              setIsCover(Boolean(isCoverPage));
              if (isCoverPage && (settings?.pageTurnMode === '3d-flip' || !settings?.pageTurnMode)) {
                try {
                  rendition.spread('none');
                } catch {
                  // ignore
                }
              }
              onCoverChangeRef.current?.(Boolean(isCoverPage));
            } catch {
              // Graceful fallback to first chapter if target section is not found
              const fallbackSec: EpubAny = await rendition.display();
              const isCoverPage = Boolean(!target || fallbackSec?.index === 0);
              setIsCover(Boolean(isCoverPage));
              if (isCoverPage && (settings?.pageTurnMode === '3d-flip' || !settings?.pageTurnMode)) {
                try {
                  rendition.spread('none');
                } catch {
                  // ignore
                }
              }
              onCoverChangeRef.current?.(Boolean(isCoverPage));
            }
          })
          .then(() => setIsLoading(false));
      })
      .catch((err) => {
        console.error('[EpubReader] Error during load:', err);
        if (!cancelled) {
          setError(err?.message || 'This EPUB could not be opened. The file may be corrupted or in an unsupported format.');
          setIsLoading(false);
        }
      });


    return () => {
      cancelled = true;
      window.removeEventListener('keydown', handleKeyDown);
      try {
        renditionRef.current?.destroy?.();
      } catch {
        // ignore
      }
      try {
        bookRef.current?.destroy?.();
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUrl]);

  // Dynamic Flow & Spread Switching on mode, cover, or margin change
  useEffect(() => {
    if (!renditionRef.current) return;
    const mode = settings?.pageTurnMode;
    const isSmallScreen = typeof window !== 'undefined' && window.innerWidth < 768;
    const targetGap = getReaderGap(isCover, isSmallScreen, settings?.marginSize);
    try {
      if (mode === 'continuous') {
        renditionRef.current.flow('scrolled');
        renditionRef.current.spread('none');
      } else if (mode === 'paginated' || isSmallScreen) {
        renditionRef.current.flow('paginated');
        renditionRef.current.spread('none');
      } else {
        renditionRef.current.flow('paginated');
        renditionRef.current.spread(isCover ? 'none' : 'always', 0);
      }
      if (renditionRef.current.manager?.settings) {
        renditionRef.current.manager.settings.gap = targetGap;
      }
      // Do NOT call resize() — it invokes manager.clear() which destroys all rendered iframes.
      // updateLayout() recalculates layout without tearing down views.
      renditionRef.current.manager?.updateLayout?.();
    } catch {
      // ignore
    }
  }, [isCover, settings?.marginSize, settings?.pageTurnMode]);

  useEffect(() => {
    if (!jumpToPosition || !bookRef.current || !renditionRef.current) return;
    try {
      if (jumpToPosition.startsWith('epubcfi(')) {
        renditionRef.current.display(jumpToPosition).catch(() => {});
      } else {
        const spineItem = bookRef.current.spine.get(jumpToPosition);
        const target = spineItem?.href || jumpToPosition;
        renditionRef.current.display(target).catch(() => {});
      }
    } catch {
      // ignore
    }
  }, [jumpToPosition]);


  // Apply theme, font size, font family, line height, and padding settings to rendition iframe
  useEffect(() => {
    if (!renditionRef.current) return;
    const currentTheme = settings?.theme ? THEME_STYLES[settings.theme] : THEME_STYLES.paper;
    const topBottomPadding = settings?.marginSize === 'compact' ? '20px' : settings?.marginSize === 'wide' ? '40px' : '28px';
    const lh = settings?.lineHeight ?? 1.65;
    const font =
      settings?.fontFamily === 'sans'
        ? "'Inter', system-ui, -apple-system, sans-serif"
        : settings?.fontFamily === 'mono'
        ? "'Courier New', Courier, monospace"
        : "'Lora', Georgia, 'Times New Roman', serif";

    try {
      if (isCover) {
        renditionRef.current.themes.default({
          html: {
            background: `${currentTheme.paperBg} !important`,
            margin: '0 !important',
            padding: '0 !important',
            width: '100% !important',
            height: '100% !important',
            overflow: 'hidden !important',
          },
          body: {
            background: `${currentTheme.paperBg} !important`,
            margin: '0 !important',
            padding: '0 !important',
            width: '100% !important',
            height: '100% !important',
            overflow: 'hidden !important',
            display: 'flex !important',
            'align-items': 'center !important',
            'justify-content': 'center !important',
          },
          'body.cover, .cover, #cover, div, section': {
            width: '100% !important',
            height: '100% !important',
            margin: '0 !important',
            padding: '0 !important',
            display: 'flex !important',
            'align-items': 'center !important',
            'justify-content': 'center !important',
          },
          'img, image, svg': {
            width: '100% !important',
            height: '100% !important',
            'max-width': '100% !important',
            'max-height': '100% !important',
            'object-fit': 'fill !important',
            display: 'block !important',
            margin: '0 !important',
            padding: '0 !important',
          },
          svg: {
            width: '100% !important',
            height: '100% !important',
          },
        });
      } else {
        renditionRef.current.themes.default({
          body: {
            color: `${currentTheme.text} !important`,
            background: `${currentTheme.paperBg} !important`,
            'line-height': `${lh} !important`,
            'font-family': `${font} !important`,
            margin: '0 !important',
            'box-sizing': 'border-box !important',
            'padding-top': `${topBottomPadding} !important`,
            'padding-bottom': `${topBottomPadding} !important`,
          },
          'body, p, span, div, li, blockquote, h1, h2, h3, h4, h5, h6': {
            color: `${currentTheme.text} !important`,
            'font-family': `${font} !important`,
            'line-height': `${lh} !important`,
          },
          html: {
            background: `${currentTheme.paperBg} !important`,
            margin: '0 !important',
            padding: '0 !important',
          },
          'img, image, svg': {
            'max-width': '100% !important',
            'max-height': '100% !important',
            'object-fit': 'contain !important',
            display: 'block !important',
            margin: '0 auto !important',
          },
        });
      }
      renditionRef.current.themes.fontSize(`${Math.round(effectiveFontScale * 100)}%`);
    } catch {
      // ignore
    }
  }, [effectiveFontScale, isCover, settings?.theme, settings?.fontFamily, settings?.lineHeight, settings?.marginSize]);

  const handlePrev = () => {
    if (!renditionRef.current) return;
    onFlipStart?.('prev');
    try {
      renditionRef.current.prev();
    } catch {
      // ignore
    }
  };

  const handleNext = () => {
    if (!renditionRef.current) return;
    onFlipStart?.('next');
    try {
      renditionRef.current.next();
    } catch {
      // ignore
    }
  };

  return (
    <div className="relative h-full w-full flex items-center justify-center overflow-hidden min-w-0">
      {isLoading && <PageSpinner />}
      {error && (
        <div className="absolute inset-x-0 top-4 mx-auto max-w-md">
          <ErrorBanner message={error} />
        </div>
      )}

      {/* Unobtrusive Page Turn Overlay Chevrons */}
      {!isLoading && !error && settings?.pageTurnMode !== 'continuous' && (
        <>
          <button
            type="button"
            onClick={handlePrev}
            aria-label="Previous page"
            className="focus-visible:focus-ring absolute left-1 sm:left-2 top-1/2 z-20 -translate-y-1/2 rounded-full border border-paper-300/60 bg-paper-100/70 p-2 text-paper-600 shadow-sm backdrop-blur opacity-25 hover:opacity-100 transition-opacity hover:bg-paper-200"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={handleNext}
            aria-label="Next page"
            className="focus-visible:focus-ring absolute right-1 sm:right-2 top-1/2 z-20 -translate-y-1/2 rounded-full border border-paper-300/60 bg-paper-100/70 p-2 text-paper-600 shadow-sm backdrop-blur opacity-25 hover:opacity-100 transition-opacity hover:bg-paper-200"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}

      <div
        ref={containerRef}
        className={`h-full w-full min-w-0 ${
          settings?.pageTurnMode === 'continuous'
            ? 'max-w-3xl overflow-y-auto px-6 py-10 mx-auto'
            : 'p-0 m-0'
        }`}
      />
    </div>
  );
}
