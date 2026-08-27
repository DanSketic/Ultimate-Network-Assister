import type { NodeFamily } from './zones';

/** Semantic status colours, resolved per theme. */
export type Tone = 'ok' | 'warn' | 'bad' | 'idle';

export type ThemeName = 'dark' | 'light';

/**
 * What the user asked for, which is not the same as what is on screen:
 * `auto` follows the operating system and resolves to a ThemeName at runtime.
 */
export const THEME_PREFS = ['auto', 'dark', 'light'] as const;

export type ThemePref = (typeof THEME_PREFS)[number];

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
  /**
   * The hypervisor's own hue.
   *
   * Everything on the hypervisor — the host, its bridges, its guests — is a
   * different kind of thing from the network gear beside it, and a reader
   * looking for "where do the virtual machines live" finds an orange box
   * before reading a single label. Kept clear of `warn`, which already means
   * "needs attention" on the same picture.
   */
  hypervisor: string;
  /**
   * What is not the estate at all.
   *
   * The accent belongs to the network the estate owns, and the internet is
   * precisely the part nobody here administers — the same colour would say it
   * is one more piece of the same kit. Violet, because the map's other
   * meanings are already spoken for: green, amber and red say how a device is
   * doing, blue says UniFi, orange says hypervisor.
   */
  internet: string;
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
    hypervisor: '#e0883a',
    internet: '#7c8cf8',
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
    hypervisor: '#b55a06',
    internet: '#5b5fd0',
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

/**
 * The colour a family's boundary is drawn in.
 *
 * One hue each, because the three are three different kinds of thing: the
 * network the estate owns takes the accent — whatever the user has set it to,
 * since that is the part of the picture they are looking at most — the
 * hypervisor takes its orange, and the internet takes a violet that says
 * "not yours".
 *
 * The zones inside a family take their family's hue rather than one of their
 * own. A zone is a subdivision, and a colour per zone would be a second set of
 * meanings on a map whose colours already say how a device is doing; the zones
 * are told apart by their labels.
 *
 * The two fixed hues stay clear of the accents on offer, so the three
 * boundaries read as three whichever accent is chosen. The one exception is
 * someone choosing an accent that *is* one of them, which leaves two families
 * sharing a colour — legible, since each still carries its name, and not worth
 * overriding a choice the user made deliberately.
 */
export function familyHue(family: NodeFamily, palette: Palette, accent: string): string {
  if (family === 'proxmox') return palette.hypervisor;
  if (family === 'internet') return palette.internet;
  return accent;
}

/** Appends an 8-digit-hex alpha channel, e.g. tint('#3ea6ff', '1f'). */
export function tint(hex: string, alpha: string): string {
  return hex + alpha;
}
