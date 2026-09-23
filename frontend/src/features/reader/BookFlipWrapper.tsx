import { useEffect, useState, type ReactNode } from 'react';
import type { ReaderSettings } from './reader-settings';
import { THEME_STYLES } from './reader-settings';

interface BookFlipWrapperProps {
  settings: ReaderSettings;
  children: ReactNode;
  isFlipping?: boolean;
  flipDirection?: 'next' | 'prev';
  isCover?: boolean;
}

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
                style={{ backgroundColor: theme.paperBg, borderColor: theme.border }}
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

                {/* 3D Realistic Double-Sided Turning Leaf Animation */}
                {turning && (
                  isSingle ? (
                    <div
                      className={`pointer-events-none absolute inset-0 z-40 will-change-transform [transform-style:preserve-3d] ${
                        flipDirection === 'next'
                          ? 'origin-left animate-[flipNext3D_0.58s_cubic-bezier(0.45,0.05,0.55,0.95)_forwards]'
                          : 'origin-right animate-[flipPrev3D_0.58s_cubic-bezier(0.45,0.05,0.55,0.95)_forwards]'
                      }`}
                    >
                      <div
                        style={{ backgroundColor: theme.paperBg, borderColor: theme.border }}
                        className="absolute inset-0 border [backface-visibility:hidden] overflow-hidden"
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-black/5 to-transparent" />
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Dynamic Cast Shadow beneath turning leaf */}
                      <div
                        aria-hidden="true"
                        className={`pointer-events-none absolute inset-y-0 z-35 w-1/2 transition-opacity ${
                          flipDirection === 'next'
                            ? 'right-0 origin-left animate-[castShadowNext_0.58s_cubic-bezier(0.45,0.05,0.55,0.95)_forwards] bg-gradient-to-r from-black/20 via-black/10 to-transparent'
                            : 'left-0 origin-right animate-[castShadowPrev_0.58s_cubic-bezier(0.45,0.05,0.55,0.95)_forwards] bg-gradient-to-l from-black/20 via-black/10 to-transparent'
                        }`}
                      />

                      {/* Double-Sided 3D Page Leaf */}
                      <div
                        className={`pointer-events-none absolute inset-y-0 z-40 w-1/2 will-change-transform [transform-style:preserve-3d] ${
                          flipDirection === 'next'
                            ? 'right-0 origin-left animate-[flipNext3D_0.58s_cubic-bezier(0.45,0.05,0.55,0.95)_forwards]'
                            : 'left-0 origin-right animate-[flipPrev3D_0.58s_cubic-bezier(0.45,0.05,0.55,0.95)_forwards]'
                        }`}
                      >
                        {/* Leaf Front Face */}
                        <div
                          style={{ backgroundColor: theme.paperBg, borderColor: theme.border }}
                          className="absolute inset-0 border [backface-visibility:hidden] overflow-hidden"
                        >
                          <div className="absolute inset-0 bg-gradient-to-r from-black/30 via-black/10 to-transparent" />
                        </div>

                        {/* Leaf Back Face */}
                        <div
                          style={{ backgroundColor: theme.paperBg, borderColor: theme.border }}
                          className="absolute inset-0 border [transform:rotateY(180deg)] [backface-visibility:hidden] overflow-hidden"
                        >
                          <div className="absolute inset-0 bg-gradient-to-l from-black/30 via-black/10 to-transparent" />
                        </div>
                      </div>
                    </>
                  )
                )}

                {/* Content Viewport — Permanently mounted without remounting */}
                <div className="relative z-10 flex h-full w-full flex-1 min-w-0 items-center justify-center overflow-hidden">
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
