import { INSPECTOR_TABS, VIEWS, type InspectorTab, type ViewId } from '@/config';

/**
 * Where the user was when they last closed the application.
 *
 * Separate from `prefs.ts` on purpose: a preference is a decision about how the
 * application should behave, and survives forever. This is a bookmark — which
 * view was open, which device was selected, how far the map was zoomed — and it
 * is worth nothing except at the next start.
 *
 * Every field is validated on the way in. This file is user-editable, it is
 * read by builds that may be newer than the one that wrote it, and a single
 * unexpected value must never be able to stop the application opening.
 */
export interface Session {
  view: ViewId;
  /** Topology sub-view. */
  sub: 'map' | 'policy';
  tab: InspectorTab;
  /** Selected topology node. */
  selected: string;
  zoom: number;
  panX: number;
  panY: number;
  /** Selected recommendation, template, article and command. */
  rec: string;
  tpl: string;
  art: number;
  cmd: number;
  legendOpen: boolean;
  /** Whether the surveyed estate or the sample one was on screen. */
  source: 'demo' | 'survey';
  /** Blueprint the planner had open. */
  blueprintId: string;
  /** When this was written, for the "carried over from" note. */
  savedAt: string;
}

const KEY = 'una.session.v1';

/** Beyond this a session is stale enough that reopening it would surprise. */
const MAX_AGE_DAYS = 30;

const SUBS: Session['sub'][] = ['map', 'policy'];
const SOURCES: Session['source'][] = ['demo', 'survey'];

const pick = <T,>(allowed: readonly T[], value: unknown, fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

const num = (value: unknown, fallback: number, lo: number, hi: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= lo && value <= hi
    ? value
    : fallback;

const text = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.length <= 200 ? value : fallback;

/**
 * The stored session, or null when there is nothing usable to restore.
 *
 * Age is checked because a session is a convenience, not a record: coming back
 * after a month to a half-finished view of an estate that has since changed is
 * worse than starting clean.
 */
export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;

    const savedAt = text(parsed.savedAt, '');
    const age = savedAt ? (Date.now() - Date.parse(savedAt)) / 86_400_000 : Infinity;
    if (!Number.isFinite(age) || age > MAX_AGE_DAYS) return null;

    return {
      view: pick(VIEWS, parsed.view, 'topology'),
      sub: pick(SUBS, parsed.sub, 'map'),
      tab: pick(INSPECTOR_TABS, parsed.tab, 'overview'),
      selected: text(parsed.selected, ''),
      // Bounds are deliberately generous: the zoom range is a UI decision that
      // may widen, and a value outside it should be clamped by the view rather
      // than throw the whole session away.
      zoom: num(parsed.zoom, 0.9, 0.05, 4),
      panX: num(parsed.panX, 0, -20_000, 20_000),
      panY: num(parsed.panY, 0, -20_000, 20_000),
      rec: text(parsed.rec, ''),
      tpl: text(parsed.tpl, 'home'),
      art: num(parsed.art, 0, 0, 999),
      cmd: num(parsed.cmd, 0, 0, 999),
      legendOpen: typeof parsed.legendOpen === 'boolean' ? parsed.legendOpen : true,
      source: pick(SOURCES, parsed.source, 'demo'),
      blueprintId: text(parsed.blueprintId, ''),
      savedAt,
    };
  } catch {
    return null;
  }
}

export function saveSession(session: Omit<Session, 'savedAt'>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...session, savedAt: new Date().toISOString() }));
  } catch {
    // Storage can be unavailable or full; the session simply will not carry
    // over, which costs nothing that cannot be clicked back to.
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do: the session is a convenience either way.
  }
}
