import { VIEWS, type ViewId } from '@/config';
import { LANGS, type LangPref } from '@/i18n';
import { THEME_PREFS, type ThemePref } from './palette';

/**
 * Startup overrides taken from the address bar.
 *
 * `?view=topology&lang=en&theme=dark` opens a named view in a named language
 * without touching what the user has stored. Two things use it: capturing the
 * documentation screenshots, where each image has to be a specific view in a
 * specific language, and linking someone straight to a view.
 *
 * It is read once and never written back, so a link cannot quietly change the
 * settings of whoever follows it.
 */
export interface DeepLink {
  view?: ViewId;
  lang?: LangPref;
  theme?: ThemePref;
  /** Frame the whole estate on the topology, as the fit button does. */
  fit?: boolean;
}

const one = <T,>(allowed: readonly T[], value: string | null): T | undefined =>
  value !== null && allowed.includes(value as T) ? (value as T) : undefined;

export function deepLink(search = typeof window === 'undefined' ? '' : window.location.search): DeepLink {
  const q = new URLSearchParams(search);
  const link: DeepLink = {};

  const view = one(VIEWS, q.get('view'));
  if (view) link.view = view;
  const lang = one(LANGS, q.get('lang'));
  if (lang) link.lang = lang;
  const theme = one(THEME_PREFS, q.get('theme'));
  if (theme) link.theme = theme;
  if (q.get('fit') === '1') link.fit = true;

  return link;
}
