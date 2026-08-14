import type { LangPref } from '@/i18n';
import { DEFAULT_ACCENT, type ThemePref } from '@/lib/palette';

export const VIEWS = [
  'overview',
  'topology',
  'survey',
  'advice',
  'backup',
  'planner',
  'ssh',
  'kb',
  'settings',
] as const;

export type ViewId = (typeof VIEWS)[number];

// View and tab labels live in the dictionary (`nav`, `inspector.tabs`): these
// ids are what the code compares on, and they never change with the language.

export const INSPECTOR_TABS = ['overview', 'services', 'conns', 'fw', 'kb', 'cfg'] as const;

export type InspectorTab = (typeof INSPECTOR_TABS)[number];

/**
 * Startup options. These mirror the knobs the design exposed, and are the
 * seam where persisted user settings will plug in.
 */
export interface AppConfig {
  /** `auto` follows the operating system's light/dark setting. */
  initialThemePref: ThemePref;
  /** `auto` follows the operating system's language. */
  initialLangPref: LangPref;
  accent: string;
  startView: ViewId;
  /** Draw management-plane (logical) links on the topology. */
  showLogicalLinks: boolean;
  /** Draw links that were inferred rather than measured. */
  showEstimated: boolean;
  /** Animate the dash flow along links. */
  animateTraffic: boolean;
}

export const DEFAULT_CONFIG: AppConfig = {
  initialThemePref: 'auto',
  initialLangPref: 'auto',
  accent: DEFAULT_ACCENT,
  startView: 'topology',
  showLogicalLinks: true,
  showEstimated: true,
  animateTraffic: true,
};

export const APP_NAME = 'Ultimate Network Assister';

/** Injected from package.json at build time (see vite.config.ts). */
declare const __APP_VERSION__: string;

export const APP_VERSION = __APP_VERSION__;
