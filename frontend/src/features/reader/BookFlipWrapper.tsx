import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from 'react';
import type { ReaderSettings } from './reader-settings';
import { THEME_STYLES, type ThemeColors } from './reader-settings';

const FLIP_DURATION_MS = 700;

// Paragraph-like line widths — only used as a last-resort placeholder
// when a real snapshot of the page can't be captured yet (e.g. nothing
// has rendered into the viewport on the very first paint).
const FAUX_LINE_WIDTHS = [96, 100, 88, 97, 92, 100, 85, 98, 90, 94, 60];

function FauxPageContent({ textColor }: { textColor: string }) {
  return (
    <div aria-hidden="true" className="absolute inset-0 flex flex-col gap-[10px] px-[13%] py-[12%]">
      <div className="mb-2 h-[7px] w-[38%] rounded-sm" style={{ backgroundColor: textColor, opacity: 0.32 }} />
      {FAUX_LINE_WIDTHS.map((width, i) => (
        <div
          key={i}
          className="h-[3px] rounded-full"
          style={{ backgroundColor: textColor, opacity: 0.16, width: `${width}%` }}
        />
      ))}
    </div>
  );
}

type LeafSnapshot = { kind: 'image'; src: string } | { kind: 'html'; html: string };

// Grabs what's actually on screen right now — the real page, not a
// mockup — so the turning leaf shows the content it's covering instead
// of a generic placeholder. PDF pages render to <canvas>, so a pixel
// copy is trivial and exact; EPUB pages render inside epub.js's
// same-origin iframe, so we take its live markup instead.
function captureSnapshot(container: HTMLElement | null): LeafSnapshot | null {
  if (!container) return null;

  const canvases = Array.from(container.querySelectorAll('canvas'));
  if (canvases.length > 0) {
    const rect = container.getBoundingClientRect();
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(rect.width));
    out.height = Math.max(1, Math.round(rect.height));
    const ctx = out.getContext('2d');
    if (ctx) {
      try {
        for (const canvas of canvases) {
          const canvasRect = canvas.getBoundingClientRect();
          ctx.drawImage(canvas, canvasRect.left - rect.left, canvasRect.top - rect.top, canvasRect.width, canvasRect.height);
        }
        return { kind: 'image', src: out.toDataURL('image/png') };
      } catch {
        // Tainted canvas (shouldn't happen for same-origin content) — fall through.
      }
    }
  }

  const iframe = container.querySelector('iframe');
  try {
    const body = iframe?.contentDocument?.body;
    if (body?.innerHTML) return { kind: 'html', html: body.innerHTML };
  } catch {
    // Cross-origin iframe — nothing we can read.
  }
  return null;
}

function LeafContent({ snapshot, textColor }: { snapshot: LeafSnapshot | null; textColor: string }) {
  if (!snapshot) return <FauxPageContent textColor={textColor} />;
  if (snapshot.kind === 'image') {
    return <img src={snapshot.src} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />;
  }
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden p-[6%] text-[0.6rem] leading-snug"
      style={{ color: textColor }}
      dangerouslySetInnerHTML={{ __html: snapshot.html }}
    />
  );
}

// Mirrors the flipNext3D/flipPrev3D keyframes (index.css) so a manual
// drag and a programmatic (button/keyboard) flip curl the same way.
function curlTransform(progress: number, direction: 'next' | 'prev'): string {
  const angle = 180 * progress * (direction === 'next' ? -1 : 1);
  const bulge = Math.sin(progress * Math.PI);
  const z = bulge * 50;
  const scaleX = 1 - bulge * 0.2;
  return `rotateY(${angle}deg) translateZ(${z}px) scaleX(${scaleX})`;
}

interface BookFlipWrapperProps {
  settings: ReaderSettings;
  children: ReactNode;
  isFlipping?: boolean;
  flipDirection?: 'next' | 'prev';
  isCover?: boolean;
}

interface TurningLeafProps {
  theme: ThemeColors;
  direction: 'next' | 'prev';
  full: boolean;
  snapshot: LeafSnapshot | null;
  drag: { progress: number; settling: boolean } | null;
}

// The page mid-turn. Only its front face is rendered — with
// backface-visibility hidden, once it rotates past 90° it simply
// vanishes, revealing the real (already-rendered) next page sitting
// underneath instead of a fabricated "back of the page." That's also
// what makes this instant: there's nothing to load, it's already there.
function TurningLeaf({ theme, direction, full, snapshot, drag }: TurningLeafProps) {
  const originClass = direction === 'next' ? 'origin-left' : 'origin-right';
  const positionClass = full ? 'inset-0' : `inset-y-0 w-1/2 ${direction === 'next' ? 'right-0' : 'left-0'}`;
  // Tailwind's JIT scanner needs the full arbitrary-value class as a
  // literal string in source — it can't resolve FLIP_DURATION_MS here,
  // so this duration is kept in sync with that constant by hand.
  const animateClass =
    drag === null
      ? direction === 'next'
        ? 'animate-[flipNext3D_700ms_cubic-bezier(0.45,0.05,0.55,0.95)_forwards]'
        : 'animate-[flipPrev3D_700ms_cubic-bezier(0.45,0.05,0.55,0.95)_forwards]'
      : '';

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute z-40 overflow-hidden border will-change-transform [backface-visibility:hidden] ${positionClass} ${originClass} ${animateClass}`}
      style={{
        backgroundColor: theme.paperBg,
        borderColor: theme.border,
        ...(drag
          ? {
              transform: curlTransform(drag.progress, direction),
              transition: drag.settling ? `transform ${FLIP_DURATION_MS * 0.4}ms cubic-bezier(0.45,0.05,0.55,0.95)` : 'none',
            }
          : {}),
      }}
    >
      <LeafContent snapshot={snapshot} textColor={theme.text} />
      <div
        className={`absolute inset-0 bg-gradient-to-r ${
          direction === 'next' ? 'from-black/5 via-black/15 to-black/40' : 'from-black/40 via-black/15 to-black/5'
        }`}
      />
      <div
        aria-hidden="true"
        className={`absolute inset-y-0 w-10 bg-gradient-to-r from-transparent via-white/25 to-transparent ${
          direction === 'next' ? 'right-0' : 'left-0'
        }`}
      />
    </div>
  );
}

const CURL_STRIP_COUNT = 14;
const CURL_STAGGER_MS = 260;

interface StripCurlLeafProps {
  direction: 'next' | 'prev';
  full: boolean;
  src: string;
  drag: { progress: number; settling: boolean } | null;
}

// A genuine bending curl (not a single flat rectangle rotating around a
// hinge): the page is sliced into thin vertical strips, each rotating
// by a slightly different amount at any instant, so together they trace
// a curved surface — the strip nearest the free edge leads, the one at
// the spine lags, so the curl visibly peels across the page rather than
// the whole thing swinging and vanishing at 90° like a stiff card.
// Only usable when we have a real pixel snapshot (PDF canvas) — a
// same-origin CSS background-position slice — since arbitrary EPUB
// markup can't be sliced this way.
function StripCurlLeaf({ direction, full, src, drag }: StripCurlLeafProps) {
  const positionClass = full ? 'inset-0' : `inset-y-0 w-1/2 ${direction === 'next' ? 'right-0' : 'left-0'}`;
  const animateClass =
    drag === null
      ? direction === 'next'
        ? 'animate-[flipNext3D_700ms_cubic-bezier(0.45,0.05,0.55,0.95)_forwards]'
        : 'animate-[flipPrev3D_700ms_cubic-bezier(0.45,0.05,0.55,0.95)_forwards]'
      : '';

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute z-40 will-change-transform [transform-style:preserve-3d] ${positionClass}`}
    >
      {Array.from({ length: CURL_STRIP_COUNT }, (_, i) => {
        // 0 at the spine/hinge, 1 at the free edge that leads the curl.
        const edgeFactor = direction === 'next' ? i / (CURL_STRIP_COUNT - 1) : 1 - i / (CURL_STRIP_COUNT - 1);
        const style: CSSProperties = {
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: `${(i / CURL_STRIP_COUNT) * 100}%`,
          width: `${100 / CURL_STRIP_COUNT}%`,
          backgroundImage: `linear-gradient(${direction === 'next' ? '90deg' : '270deg'}, transparent 82%, rgba(0,0,0,0.14) 100%), url(${src})`,
          backgroundSize: `100% 100%, ${CURL_STRIP_COUNT * 100}% 100%`,
          backgroundPosition: `0 0, ${(i / (CURL_STRIP_COUNT - 1)) * 100}% 0`,
          backfaceVisibility: 'hidden',
          transformOrigin: direction === 'next' ? 'left center' : 'right center',
        };
        if (drag) {
          const localProgress = Math.min(1, Math.max(0, drag.progress * 1.6 - edgeFactor * 0.6));
          style.transform = curlTransform(localProgress, direction);
          style.transition = drag.settling ? `transform ${FLIP_DURATION_MS * 0.4}ms cubic-bezier(0.45,0.05,0.55,0.95)` : 'none';
        } else {
          style.animationDelay = `${-(edgeFactor * CURL_STAGGER_MS)}ms`;
        }
        return <div key={i} className={animateClass} style={style} />;
      })}
    </div>
  );
}

function CastShadow({ direction, full }: { direction: 'next' | 'prev'; full: boolean }) {
  const positionClass = full ? 'w-full' : `w-1/2 ${direction === 'next' ? 'right-0' : 'left-0'}`;
  const originClass = direction === 'next' ? 'origin-left' : 'origin-right';
  const animateClass = direction === 'next' ? 'animate-[castShadowNext_700ms_cubic-bezier(0.45,0.05,0.55,0.95)_forwards]' : 'animate-[castShadowPrev_700ms_cubic-bezier(0.45,0.05,0.55,0.95)_forwards]';
  const gradientClass = direction === 'next' ? 'bg-gradient-to-r from-black/25 via-black/10 to-transparent' : 'bg-gradient-to-l from-black/25 via-black/10 to-transparent';
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-y-0 z-35 transition-opacity ${positionClass} ${originClass} ${animateClass} ${gradientClass}`} />
  );
}

const DRAG_START_THRESHOLD_PX = 8;
const DRAG_COMMIT_THRESHOLD = 0.32;

export function BookFlipWrapper({
  settings,
  children,
  isFlipping = false,
  flipDirection = 'next',
  isCover = false,
}: BookFlipWrapperProps) {
  const theme = THEME_STYLES[settings.theme];
  const turning = isFlipping;

  const [windowWidth, setWindowWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1024
  );

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = windowWidth < 768;
  const isSingle = isCover || isMobile;

  const warmthOpacity = (settings.temperature / 100) * 0.35;

  const contentRef = useRef<HTMLDivElement>(null);
  const pageAreaRef = useRef<HTMLDivElement>(null);
  const [snapshot, setSnapshot] = useState<LeafSnapshot | null>(null);

  // Captures the outgoing page the instant a programmatic (button or
  // keyboard) flip starts — before the reader swaps in the new page —
  // so the leaf that's about to appear shows what was really there.
  const wasFlipping = useRef(false);
  useLayoutEffect(() => {
    if (turning && !wasFlipping.current) {
      setSnapshot(captureSnapshot(contentRef.current));
    }
    wasFlipping.current = turning;
  }, [turning]);

  // A drag-driven flip visually finishes on its own (see handlePointerUp);
  // once it does, the parent's `isFlipping` window is still open for a
  // moment, and it shouldn't spawn a second, from-scratch flip on top.
  const suppressKeyframeLeaf = useRef(false);
  useEffect(() => {
    if (!turning) suppressKeyframeLeaf.current = false;
  }, [turning]);

  const dragStart = useRef<{ x: number; y: number; direction: 'next' | 'prev' | null } | null>(null);
  const [drag, setDrag] = useState<{ direction: 'next' | 'prev'; progress: number; settling: boolean } | null>(null);

  const handlePointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (settings.pageTurnMode !== '3d-flip' || turning || drag) return;
      dragStart.current = { x: e.clientX, y: e.clientY, direction: null };
    },
    [settings.pageTurnMode, turning, drag]
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const start = dragStart.current;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;

      if (!start.direction) {
        if (Math.abs(dx) < DRAG_START_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy)) return;
        start.direction = dx < 0 ? 'next' : 'prev';
        setSnapshot(captureSnapshot(contentRef.current));
        e.currentTarget.setPointerCapture(e.pointerId);
      }

      const width = pageAreaRef.current?.getBoundingClientRect().width || 400;
      const dragDistance = width * (isSingle ? 0.7 : 0.55);
      const progress = Math.min(1, Math.abs(dx) / dragDistance);
      setDrag({ direction: start.direction, progress, settling: false });
    },
    [isSingle]
  );

  const finishDrag = useCallback((committed: boolean, direction: 'next' | 'prev') => {
    setDrag({ direction, progress: committed ? 1 : 0, settling: true });
    if (committed) {
      suppressKeyframeLeaf.current = true;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: direction === 'next' ? 'ArrowRight' : 'ArrowLeft' }));
    }
    window.setTimeout(() => setDrag(null), FLIP_DURATION_MS * 0.4 + 20);
  }, []);

  const handlePointerUp = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const start = dragStart.current;
      dragStart.current = null;
      if (!start?.direction) return;
      e.currentTarget.releasePointerCapture?.(e.pointerId);
      const committed = (drag?.progress ?? 0) >= DRAG_COMMIT_THRESHOLD;
      finishDrag(committed, start.direction);
    },
    [drag, finishDrag]
  );

  const handlePointerCancel = useCallback(() => {
    const start = dragStart.current;
    dragStart.current = null;
    if (start?.direction) finishDrag(false, start.direction);
  }, [finishDrag]);

  const showDragLeaf = drag !== null;
  const showKeyframeLeaf = turning && !showDragLeaf && !suppressKeyframeLeaf.current;
  const activeDirection = showDragLeaf ? drag.direction : flipDirection;

  return (
    <div
      style={{ backgroundColor: theme.bg, color: theme.text }}
      className="relative flex h-full w-full flex-col overflow-hidden transition-colors duration-300 select-none"
    >
      {/* Ambience Brightness Container */}
      <div
        style={{ filter: `brightness(${settings.brightness}%)` }}
        className="relative flex h-full w-full flex-col items-center justify-center transition-all duration-200"
      >
        {settings.pageTurnMode === '3d-flip' ? (
          /* 3D Realistic Physical Book Viewport */
          <div className="relative flex h-full w-full items-center justify-center p-2 sm:p-4 [perspective:2200px]">
            <div
              className={`relative flex items-center justify-center min-w-0 ${
                isSingle
                  ? 'h-full max-h-[85vh] aspect-[9/16] max-w-full rounded-r-2xl rounded-l-md bg-[#241a13] dark:bg-[#151210] p-1.5 sm:p-2.5 shadow-[12px_25px_60px_rgba(0,0,0,0.55),0_0_0_1px_rgba(0,0,0,0.3)] [transform-style:preserve-3d]'
                  : 'h-full max-h-[85vh] aspect-[18/16] max-w-[95vw] rounded-2xl bg-[#2e231a] dark:bg-[#1a1614] p-1.5 sm:p-2.5 shadow-[0_25px_60px_rgba(0,0,0,0.45)]'
              }`}
            >
              {/* Physical Hardcover Spine on Left Edge (Cover mode) */}
              {isCover && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-0 z-30 w-5 sm:w-6 rounded-l-md bg-gradient-to-r from-[#120d09] via-[#35261b] to-[#1f1610] shadow-[inset_-2px_0_4px_rgba(0,0,0,0.5),2px_0_4px_rgba(0,0,0,0.4)] border-r border-[#0d0a07]/60 flex flex-col justify-between py-6 items-center"
                >
                  <div className="h-8 w-1 bg-amber-600/30 rounded-full" />
                  <div className="h-8 w-1 bg-amber-600/30 rounded-full" />
                </div>
              )}

              {/* Paper Block with Stacked Page Thickness Edges */}
              <div
                ref={pageAreaRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                style={{ backgroundColor: theme.paperBg, borderColor: theme.border, touchAction: 'pan-y' }}
                className={`relative flex h-full w-full flex-1 min-w-0 overflow-hidden transition-colors ${
                  isCover
                    ? 'ml-3 sm:ml-4 rounded-r-xl border border-amber-900/20 shadow-[4px_0_0_#e8dfce,8px_0_0_#ded3bd,0_5px_0_#e8dfce,0_9px_0_#ded3bd]'
                    : isMobile
                    ? 'rounded-xl border border-amber-900/20 shadow-[4px_0_0_#e8dfce,8px_0_0_#ded3bd,0_5px_0_#e8dfce,0_9px_0_#ded3bd]'
                    : 'rounded-xl border border-amber-900/20 shadow-[-4px_0_0_#e8dfce,-8px_0_0_#ded3bd,4px_0_0_#e8dfce,8px_0_0_#ded3bd] [transform-style:preserve-3d] will-change-transform'
                }`}
              >
                {/* Subtle Book Cover Spine Shadow and Texture Overlay (Cover mode) */}
                {isCover && (
                  <>
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 left-0 z-20 w-8 bg-gradient-to-r from-black/25 via-black/10 to-transparent"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-tr from-black/5 via-transparent to-white/10"
                    />
                  </>
                )}

                {/* Left & Right Page Concave Curvature Shadow & Center Spine Crease (Spread mode) */}
                {!isSingle && (
                  <>
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 right-1/2 z-20 w-7 sm:w-8 bg-gradient-to-r from-transparent via-black/[0.03] to-black/[0.14]"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 left-1/2 z-20 w-7 sm:w-8 bg-gradient-to-l from-transparent via-black/[0.03] to-black/[0.14]"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 left-1/2 z-30 w-[1px] -translate-x-1/2 bg-black/30 opacity-60"
                    />
                  </>
                )}

                {/* Turning leaf — either a live drag or a programmatic (button/keyboard) flip */}
                {(showDragLeaf || showKeyframeLeaf) && (
                  <>
                    <CastShadow direction={activeDirection} full={isSingle} />
                    {snapshot?.kind === 'image' ? (
                      <StripCurlLeaf
                        direction={activeDirection}
                        full={isSingle}
                        src={snapshot.src}
                        drag={showDragLeaf ? { progress: drag.progress, settling: drag.settling } : null}
                      />
                    ) : (
                      <TurningLeaf
                        theme={theme}
                        direction={activeDirection}
                        full={isSingle}
                        snapshot={snapshot}
                        drag={showDragLeaf ? { progress: drag.progress, settling: drag.settling } : null}
                      />
                    )}
                  </>
                )}

                {/* Content Viewport — Permanently mounted without remounting */}
                <div ref={contentRef} className="relative z-10 flex h-full w-full flex-1 min-w-0 items-center justify-center overflow-hidden">
                  {children}
                </div>
              </div>
            </div>
          </div>
        ) : settings.pageTurnMode === 'continuous' ? (
          /* Continuous Scroll Viewport */
          <div className="h-full w-full max-w-4xl overflow-y-auto p-4 sm:p-8">
            <div
              style={{ backgroundColor: theme.paperBg, borderColor: theme.border }}
              className="min-h-full w-full rounded-xl border p-4 shadow-md transition-colors"
            >
              {children}
            </div>
          </div>
        ) : (
          /* Paginated Slide Viewport */
          <div className="relative flex h-full w-full items-center justify-center p-2 sm:p-4">
            <div
              style={{ backgroundColor: theme.paperBg, borderColor: theme.border }}
              className="h-full max-h-[85vh] aspect-[9/16] max-w-full rounded-xl border shadow-lg transition-colors overflow-hidden"
            >
              {children}
            </div>
          </div>
        )}
      </div>

      {/* Color Temperature / Warm Light Tint Overlay */}
      {settings.temperature > 0 && (
        <div
          aria-hidden="true"
          style={{
            backgroundColor: `rgba(255, 160, 40, ${warmthOpacity})`,
            mixBlendMode: 'multiply',
          }}
          className="pointer-events-none absolute inset-0 z-50 transition-opacity duration-300"
        />
      )}
    </div>
  );
}
