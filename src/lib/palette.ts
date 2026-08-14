/** Semantic status colours, resolved per theme. */
export type Tone = 'ok' | 'warn' | 'bad' | 'idle';

export type ThemeName = 'dark' | 'light';

/**
 * What the user asked for, which is not the same as what is on screen:
 * `auto` follows the operating system and resolves to a ThemeName at runtime.
 */
export type ThemePref = 'auto' | 'dark' | 'light';

export interface Palette {
  /** Healthy / verified. */
  ok: string;
  /** Needs attention. */
  warn: string;
  /** Failing / missing evidence. */
  bad: string;
  /** Unknown or unverifiable. */
  idle: string;
  line: string;
  line2: string;
  textMuted: string;
  /** Topology node background. */
  card: string;
  /** Topology node background when selected. */
  cardSelected: string;
  accent: string;
}

export const PALETTES: Record<ThemeName, Palette> = {
  dark: {
    ok: '#3ecf8e',
    warn: '#f2b544',
    bad: '#f0655a',
    idle: '#5f6b79',
    line: '#26303b',
    line2: '#36434f',
    textMuted: '#6b7686',
    card: '#141a21',
    cardSelected: '#18222d',
    accent: '#3ea6ff',
  },
  light: {
    ok: '#12925e',
    warn: '#b57708',
    bad: '#cf3b2d',
    idle: '#98a3b0',
    line: '#e2e7ee',
    line2: '#c3cedb',
    textMuted: '#8a94a1',
    card: '#ffffff',
    cardSelected: '#f0f7ff',
    accent: '#0b74d8',
  },
};

/**
 * The theme the operating system is asking for.
 *
 * Both cases are asked explicitly rather than treating "not light" as dark.
 * The desktop shell used to pin its window to a dark theme, which made the
 * light query answer no on a light desktop and the whole application open in
 * the wrong theme; being explicit means a webview that answers neither is
 * recognisable as having no preference rather than silently meaning dark.
 */
export function systemTheme(): ThemeName {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'dark';
}

export const DEFAULT_ACCENT = '#3ea6ff';

/** Accent colours offered by the design. */
export const ACCENT_CHOICES = ['#3ea6ff', '#4ec9b0', '#7c8cf8', '#e0883a'] as const;

/**
 * An explicitly chosen accent wins; otherwise each theme keeps its own accent
 * so the light theme stays legible (its blue is darker than the dark theme's).
 */
export function resolveAccent(theme: ThemeName, configured?: string): string {
  if (configured && configured !== DEFAULT_ACCENT) return configured;
  return PALETTES[theme].accent;
}

/** Appends an 8-digit-hex alpha channel, e.g. tint('#3ea6ff', '1f'). */
export function tint(hex: string, alpha: string): string {
  return hex + alpha;
}
