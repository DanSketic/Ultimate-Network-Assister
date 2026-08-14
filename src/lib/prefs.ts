import type { LangPref } from '@/i18n';
import type { ThemePref } from './palette';

/**
 * Interface preferences that survive a restart.
 *
 * These are choices about the application itself, not about an estate, so they
 * live in local storage rather than the survey database — available in both
 * the browser build and the desktop shell, and never worth a native round trip.
 */
export interface Prefs {
  themePref: ThemePref;
  langPref: LangPref;
}

const KEY = 'una.prefs.v1';

const THEME_VALUES: ThemePref[] = ['auto', 'dark', 'light'];
const LANG_VALUES: LangPref[] = ['auto', 'hu', 'en'];

export function loadPrefs(fallback: Prefs): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      // Anything unrecognised falls back rather than being trusted: this file
      // is user-editable and a bad value would break the whole shell.
      themePref: THEME_VALUES.includes(parsed.themePref as ThemePref)
        ? (parsed.themePref as ThemePref)
        : fallback.themePref,
      langPref: LANG_VALUES.includes(parsed.langPref as LangPref)
        ? (parsed.langPref as LangPref)
        : fallback.langPref,
    };
  } catch {
    return fallback;
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Storage can be unavailable or full; the choice simply will not persist.
  }
}
