import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppConfig, InspectorTab, ViewId } from '@/config';
import { resolveLang, useT, type Lang, type LangPref } from '@/i18n';
import { copyText } from '@/lib/desktop';
import {
  PALETTES,
  resolveAccent,
  systemTheme,
  type Palette,
  type ThemeName,
  type ThemePref,
} from '@/lib/palette';
import { deepLink } from '@/lib/deeplink';
import { loadPrefs, savePrefs } from '@/lib/prefs';
import { loadSession } from '@/lib/session';

export interface AppState {
  /** What the user chose; `auto` follows the operating system. */
  themePref: ThemePref;
  /** Interface language choice; `auto` follows the operating system. */
  langPref: LangPref;
  view: ViewId;
  /** Topology sub-view. */
  sub: 'map' | 'policy';
  /** Inspector tab. */
  tab: InspectorTab;
  /** Selected topology node id. */
  selected: string;
  /** Hovered topology node id; highlights its links. */
  hovered: string | null;
  zoom: number;
  panX: number;
  panY: number;
  /** Selected recommendation id. */
  rec: string;
  /** Selected deployment template id. */
  tpl: string;
  /** Selected knowledge-base article index. */
  art: number;
  /** Selected SSH command index. */
  cmd: number;
  legendOpen: boolean;
}

/*
 * Low enough that a full estate still fits in a narrow window. Below roughly
 * this the labels stop being readable, but the shape of the network — which is
 * what someone is after when they ask to see all of it — still reads.
 */
export const ZOOM_MIN = 0.35;
export const ZOOM_MAX = 1.4;
export const ZOOM_STEP = 0.1;
export const ZOOM_DEFAULT = 0.9;

export interface AppStateApi {
  state: AppState;
  patch: (next: Partial<AppState>) => void;
  palette: Palette;
  accent: string;
  themePref: ThemePref;
  /** The theme actually on screen, after `auto` is resolved. */
  resolvedTheme: ThemeName;
  setThemePref: (pref: ThemePref) => void;
  langPref: LangPref;
  /** The language actually in use, after `auto` is resolved. */
  lang: Lang;
  setLangPref: (pref: LangPref) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  /**
   * Applies a fit worked out by the view.
   *
   * The numbers have to come from the canvas: only it knows where the nodes
   * ended up and how much room is left beside the inspector. Called with
   * nothing — no nodes to measure — it falls back to the opening view.
   */
  zoomFit: (fit?: { zoom: number; panX: number; panY: number }) => void;
}

export function useAppState(config: AppConfig): AppStateApi {
  /*
   * Opened where it was left.
   *
   * The previous session is read once, at the first render, so the first paint
   * is already the right view — restoring afterwards would show the default for
   * a frame and then jump. `hovered` is deliberately not carried over: it
   * describes where the pointer is, and the pointer is somewhere else now.
   */
  const restored = useMemo(() => loadSession(), []);

  /*
   * An address-bar override outranks both.
   *
   * The order is deliberate: what the link asked for, then where the user was,
   * then what the application is configured to open on. Nothing here is written
   * back, so following a link cannot change anyone's stored settings.
   */
  const link = useMemo(() => deepLink(), []);

  const [state, setState] = useState<AppState>(() => ({
    // A saved choice wins over the configured default.
    ...loadPrefs({ themePref: config.initialThemePref, langPref: config.initialLangPref }),
    ...(link.theme ? { themePref: link.theme } : {}),
    ...(link.lang ? { langPref: link.lang } : {}),
    view: link.view ?? restored?.view ?? config.startView,
    sub: link.sub ?? restored?.sub ?? 'map',
    tab: restored?.tab ?? 'overview',
    selected: restored?.selected || 'pve',
    hovered: null,
    zoom: restored?.zoom ?? ZOOM_DEFAULT,
    panX: restored?.panX ?? 0,
    panY: restored?.panY ?? 0,
    rec: restored?.rec || 'r1',
    tpl: restored?.tpl || 'home',
    art: restored?.art ?? 0,
    cmd: restored?.cmd ?? 0,
    legendOpen: restored?.legendOpen ?? true,
  }));

  const patch = useCallback((next: Partial<AppState>) => {
    setState((prev) => ({ ...prev, ...next }));
  }, []);

  const [system, setSystem] = useState<ThemeName>(systemTheme);

  // Only matters while the preference is `auto`, but the listener is cheap and
  // keeping it always-on avoids a stale reading the moment someone picks auto.
  useEffect(() => {
    if (!window.matchMedia) return;
    const query = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => setSystem(query.matches ? 'light' : 'dark');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const resolvedTheme: ThemeName = state.themePref === 'auto' ? system : state.themePref;

  const palette = PALETTES[resolvedTheme];
  const accent = useMemo(
    () => resolveAccent(resolvedTheme, config.accent),
    [resolvedTheme, config.accent],
  );

  // The stylesheet reads --accent, so the resolved value has to reach the
  // document element rather than staying in React state.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    document.documentElement.style.setProperty('--accent', accent);
  }, [resolvedTheme, accent]);

  const setThemePref = useCallback((themePref: ThemePref) => {
    setState((prev) => ({ ...prev, themePref }));
  }, []);

  const setLangPref = useCallback((langPref: LangPref) => {
    setState((prev) => ({ ...prev, langPref }));
  }, []);

  const lang = resolveLang(state.langPref);

  useEffect(() => {
    savePrefs({ themePref: state.themePref, langPref: state.langPref });
  }, [state.themePref, state.langPref]);

  // Assistive technology and the browser's own text handling both read this.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const zoomIn = useCallback(() => {
    setState((prev) => ({ ...prev, zoom: Math.min(ZOOM_MAX, prev.zoom + ZOOM_STEP) }));
  }, []);

  const zoomOut = useCallback(() => {
    setState((prev) => ({ ...prev, zoom: Math.max(ZOOM_MIN, prev.zoom - ZOOM_STEP) }));
  }, []);

  const zoomFit = useCallback((fit?: { zoom: number; panX: number; panY: number }) => {
    setState((prev) => ({
      ...prev,
      zoom: fit?.zoom ?? ZOOM_DEFAULT,
      panX: fit?.panX ?? 0,
      panY: fit?.panY ?? 0,
    }));
  }, []);

  return {
    state,
    patch,
    palette,
    accent,
    themePref: state.themePref,
    resolvedTheme,
    setThemePref,
    langPref: state.langPref,
    lang,
    setLangPref,
    zoomIn,
    zoomOut,
    zoomFit,
  };
}

export interface CopyApi {
  /** Key of the item copied most recently, or null once the hint expires. */
  copied: string | null;
  copy: (text: string, key: string) => void;
  /** The "copied" hint while it is showing, otherwise the given idle label. */
  label: (key: string, idle?: string) => string;
}

const COPY_HINT_MS = 1400;

export function useCopyFeedback(): CopyApi {
  const t = useT();
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const copy = useCallback((text: string, key: string) => {
    void copyText(text);
    setCopied(key);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), COPY_HINT_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const label = useCallback(
    (key: string, idle = t.common.copy) => (copied === key ? t.common.copied : idle),
    [copied, t],
  );

  return { copied, copy, label };
}
