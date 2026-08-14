import { createContext, useContext } from 'react';
import { en } from './en';
import { hu, type Dict } from './hu';
import type { Lang } from './lang';

export type { Dict } from './hu';
export type { Lang, LangPref } from './lang';
export { LANGS, LANG_LABELS, LOCALES, resolveLang, systemLang } from './lang';

const DICTS: Record<Lang, Dict> = { hu, en };

export function dict(lang: Lang): Dict {
  return DICTS[lang];
}

export interface I18n {
  lang: Lang;
  t: Dict;
}

/**
 * Language reaches components through context rather than props.
 *
 * Everything else in this application is threaded explicitly, but the
 * dictionary is needed by nearly every component and carries no state of its
 * own — passing it down by hand would add noise to every signature without
 * making anything clearer.
 */
const I18nContext = createContext<I18n>({ lang: 'hu', t: hu });

export const I18nProvider = I18nContext.Provider;

export function useI18n(): I18n {
  return useContext(I18nContext);
}

/** The dictionary for the active language. */
export function useT(): Dict {
  return useContext(I18nContext).t;
}
