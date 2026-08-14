export type Lang = 'hu' | 'en';

export const LANGS: Lang[] = ['hu', 'en'];

/** Shown in the language switcher, each in its own language. */
export const LANG_LABELS: Record<Lang, string> = {
  hu: 'Magyar',
  en: 'English',
};

/**
 * What the user chose. `auto` follows the operating system, the same way the
 * theme preference does.
 */
export type LangPref = 'auto' | Lang;

/**
 * The interface language the operating system implies.
 *
 * `navigator.languages` is ordered by preference, so the first *supported*
 * entry wins. Matching any entry regardless of position would let a fallback
 * language outrank the one actually asked for.
 */
export function systemLang(): Lang {
  if (typeof navigator === 'undefined') return 'en';
  const tags = navigator.languages?.length ? navigator.languages : [navigator.language];

  for (const tag of tags) {
    const base = tag?.toLowerCase().split('-')[0];
    if (base && (LANGS as string[]).includes(base)) return base as Lang;
  }

  return 'en';
}

export function resolveLang(pref: LangPref): Lang {
  return pref === 'auto' ? systemLang() : pref;
}

/**
 * Locale used for dates and numbers. Kept next to the language so the two can
 * never drift apart.
 */
export const LOCALES: Record<Lang, string> = {
  hu: 'hu-HU',
  en: 'en-GB',
};
