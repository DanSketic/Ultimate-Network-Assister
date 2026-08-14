import type { ReactElement } from 'react';
import type { ViewId } from '@/config';

const strokeProps = {
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.3,
} as const;

const NAV_PATHS: Record<ViewId, ReactElement> = {
  overview: (
    <>
      <rect x="2.5" y="2.5" width="6" height="6" rx="1.2" />
      <rect x="11.5" y="2.5" width="6" height="6" rx="1.2" />
      <rect x="2.5" y="11.5" width="6" height="6" rx="1.2" />
      <rect x="11.5" y="11.5" width="6" height="6" rx="1.2" />
    </>
  ),
  topology: (
    <>
      <circle cx="10" cy="4" r="2.1" />
      <circle cx="4" cy="16" r="2.1" />
      <circle cx="16" cy="16" r="2.1" />
      <path d="M10 6.1 4.6 13.9M10 6.1l5.4 7.8" />
    </>
  ),
  survey: (
    <>
      <circle cx="8.8" cy="8.8" r="5.3" />
      <path d="M12.8 12.8 17 17" />
    </>
  ),
  advice: (
    <>
      <path d="M10 2.6 17 6.4v7.2L10 17.4 3 13.6V6.4z" />
      <circle cx="10" cy="10" r="2.2" />
    </>
  ),
  backup: (
    <>
      <ellipse cx="10" cy="5" rx="6.4" ry="2.5" />
      <path d="M3.6 5v10c0 1.4 2.9 2.5 6.4 2.5s6.4-1.1 6.4-2.5V5" />
      <path d="M3.6 10c0 1.4 2.9 2.5 6.4 2.5s6.4-1.1 6.4-2.5" />
    </>
  ),
  planner: (
    <>
      <rect x="2.8" y="3" width="14.4" height="14" rx="1.6" />
      <path d="M2.8 7.6h14.4M7.4 7.6V17" />
    </>
  ),
  ssh: (
    <>
      <rect x="2.5" y="3.5" width="15" height="13" rx="1.6" />
      <path d="M5.8 8.2 8.6 10.6 5.8 13M10.6 13.4h4" />
    </>
  ),
  kb: (
    <>
      <path d="M3.2 4.2h5.2c1 0 1.6.6 1.6 1.5v10c0-.9-.6-1.5-1.6-1.5H3.2z" />
      <path d="M16.8 4.2h-5.2c-1 0-1.6.6-1.6 1.5v10c0-.9.6-1.5 1.6-1.5h5.2z" />
    </>
  ),
  settings: (
    <>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2.6v2.2M10 15.2v2.2M17.4 10h-2.2M4.8 10H2.6M15.2 4.8l-1.5 1.5M6.3 13.7l-1.5 1.5M15.2 15.2l-1.5-1.5M6.3 6.3 4.8 4.8" />
    </>
  ),
};

export function NavIcon({ view }: { view: ViewId }) {
  return (
    <svg width="19" height="19" aria-hidden="true" {...strokeProps}>
      {NAV_PATHS[view]}
    </svg>
  );
}

/**
 * The application mark.
 *
 * Same geometry as the generated app icon (see scripts/gen-icons.mjs), so the
 * title bar and the taskbar show one thing, not two: the accent plate with the
 * topology glyph the navigation rail also uses.
 */
export function AppMark({ size = 22 }: { size?: number }) {
  const ink = '#0a1220';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="6.2" fill="var(--accent)" />
      <path
        d="M12 6.9 6.6 17.1M12 6.9l5.4 10.2"
        stroke={ink}
        strokeWidth={2.9}
        strokeLinecap="round"
        fill="none"
      />
      <g fill={ink}>
        <circle cx="12" cy="6.9" r="2.8" />
        <circle cx="6.6" cy="17.1" r="2.8" />
        <circle cx="17.4" cy="17.1" r="2.8" />
      </g>
    </svg>
  );
}

/*
 * Module-group glyphs.
 *
 * Groups are told apart by shape, not by colour: in this application colour
 * carries risk, and a second colour vocabulary competing with it would make
 * both harder to read.
 */
const MODULE_GLYPHS: Record<string, ReactElement> = {
  overview: (
    <>
      <rect x="2.6" y="3.2" width="14.8" height="5.6" rx="1.4" />
      <rect x="2.6" y="11.2" width="6.4" height="5.6" rx="1.4" />
      <rect x="11" y="11.2" width="6.4" height="5.6" rx="1.4" />
    </>
  ),
  network: (
    <>
      <circle cx="10" cy="10" r="2.3" />
      <circle cx="10" cy="3.3" r="1.6" />
      <circle cx="16.7" cy="13.4" r="1.6" />
      <circle cx="3.3" cy="13.4" r="1.6" />
      <path d="M10 7.7V4.9M11.9 11.3l3.4 1.5M8.1 11.3l-3.4 1.5" />
    </>
  ),
  server: (
    <>
      <rect x="2.8" y="3.4" width="14.4" height="4.4" rx="1.3" />
      <rect x="2.8" y="9.4" width="14.4" height="4.4" rx="1.3" />
      <path d="M2.8 16.4h14.4" />
      <path d="M5.6 5.6h.01M5.6 11.6h.01" strokeWidth={1.9} strokeLinecap="round" />
    </>
  ),
  services: (
    <>
      <rect x="2.6" y="7" width="8.6" height="8.6" rx="1.5" />
      <rect x="8.8" y="4" width="8.6" height="8.6" rx="1.5" />
    </>
  ),
  ops: (
    <>
      <path d="M3.2 14.6a7.2 7.2 0 1 1 13.6 0" />
      <path d="M10 13.6 13.4 8.4" strokeLinecap="round" />
      <circle cx="10" cy="14.2" r="1.2" />
    </>
  ),
};

export function ModuleGlyph({ group, size = 17 }: { group: string; size?: number }) {
  return (
    <svg width={size} height={size} aria-hidden="true" {...strokeProps}>
      {MODULE_GLYPHS[group] ?? MODULE_GLYPHS['overview']}
    </svg>
  );
}

/**
 * Faint concentric rings in a card's top-right corner.
 *
 * Purely decorative, and kept at low opacity so it never competes with the
 * status colours it sits behind. The card clips it.
 */
export function CardMotif({ opacity = 0.09 }: { opacity?: number }) {
  return (
    <svg
      width="118"
      height="84"
      viewBox="0 0 118 84"
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        pointerEvents: 'none',
        opacity,
        color: 'var(--accent)',
      }}
    >
      <g fill="none" stroke="currentColor" strokeWidth={1.3}>
        <circle cx="96" cy="-4" r="19" />
        <circle cx="96" cy="-4" r="32" />
        <circle cx="96" cy="-4" r="45" />
      </g>
    </svg>
  );
}

const themeIconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export function MonitorIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} aria-hidden="true" {...themeIconProps}>
      <rect x="2.5" y="4" width="19" height="13" rx="2" />
      <path d="M9 20.5h6M12 17.5v3" />
    </svg>
  );
}

export function SunIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} aria-hidden="true" {...themeIconProps}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.6v2.1M12 19.3v2.1M21.4 12h-2.1M4.7 12H2.6M18.6 5.4l-1.5 1.5M6.9 17.1l-1.5 1.5M18.6 18.6l-1.5-1.5M6.9 6.9 5.4 5.4" />
    </svg>
  );
}

export function MoonIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} aria-hidden="true" {...themeIconProps}>
      <path d="M20.2 14.6A8.6 8.6 0 0 1 9.4 3.8a8.6 8.6 0 1 0 10.8 10.8Z" />
    </svg>
  );
}

export function SearchIcon({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      style={{ flex: 'none' }}
      aria-hidden="true"
    >
      <circle cx="8.8" cy="8.8" r="5.3" />
      <path d="M12.8 12.8 17 17" />
    </svg>
  );
}

export function CaretIcon({ flipped }: { flipped: boolean }) {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      style={{ flex: 'none', transform: flipped ? 'rotate(180deg)' : 'none' }}
      aria-hidden="true"
    >
      <path d="M2 3.5 L5 6.5 L8 3.5" />
    </svg>
  );
}
