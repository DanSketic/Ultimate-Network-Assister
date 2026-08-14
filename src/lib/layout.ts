/*
 * Where the user has put things by hand.
 *
 * The automatic layout orders each tier to keep cables from crossing, and it
 * is right most of the time — but it optimises a number, and a person looking
 * at their own network knows things the number does not: which switch is in
 * the cellar, which two machines belong together, what the room actually looks
 * like. So a card can be dragged, and what is dragged stays dragged.
 *
 * Only what was moved is stored. Everything else keeps following the automatic
 * layout, so a device added later still lands somewhere sensible instead of at
 * the origin — and resetting is a matter of forgetting these, not of
 * recomputing anything.
 */

export interface Placement {
  x: number;
  y: number;
}

const KEY = 'una.layout.v1';

/** Far enough outside any sane canvas that a stored value this big is corrupt. */
const LIMIT = 40_000;

export type Layout = Record<string, Placement>;

export function loadLayout(): Layout {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};

    const out: Layout = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      const place = value as Partial<Placement> | null;
      if (
        !place ||
        typeof place.x !== 'number' ||
        typeof place.y !== 'number' ||
        !Number.isFinite(place.x) ||
        !Number.isFinite(place.y) ||
        Math.abs(place.x) > LIMIT ||
        Math.abs(place.y) > LIMIT
      ) {
        continue;
      }
      out[id] = { x: place.x, y: place.y };
    }
    return out;
  } catch {
    return {};
  }
}

export function saveLayout(layout: Layout): void {
  try {
    if (Object.keys(layout).length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    // Storage can be unavailable or full; the arrangement then lasts only as
    // long as the window, which is a great deal better than refusing the drag.
  }
}
