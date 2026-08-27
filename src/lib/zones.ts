import type { NetNode, ZoneKey } from '@/data/model';
import { NODE_H, NODE_W } from './geometry';

/*
 * Outlines round the cards that belong together.
 *
 * The map answers "what is wired to what" well and "what belongs with what"
 * not at all: a hypervisor, its bridge and its guests are the same part of the
 * estate, and nothing on screen said so. A dashed outline round each group is
 * the plainest way to say it — the same device does not move, gains no colour,
 * and is simply enclosed.
 *
 * Two rules, and both are there to keep an outline from ever saying something
 * untrue:
 *
 *   Every card is inside one. A card left out looks like a card the estate
 *   could not place, and there is no such thing — every card has a zone. An
 *   earlier version drew a boundary only round pairs, so a lone gateway sat
 *   outside every outline for a reason nobody could see from the picture.
 *
 *   A run ends where another zone begins, and only there. Empty space between
 *   two cards of the same zone claims nothing about anybody; a card of another
 *   zone caught inside the boundary would be a false statement.
 *
 * Outlines are drawn per row rather than round every card of a zone at once,
 * and that is deliberate too. A zone spanning three rows has a bounding box
 * that swallows whatever sits between them, which would claim membership the
 * estate never had. A run of neighbouring cards in one row claims exactly what
 * it encloses and nothing else.
 */

export interface ZoneArea {
  zone: ZoneKey;
  /** Whose cards these are, since a zone outline takes its family's colour. */
  family: NodeFamily;
  x: number;
  y: number;
  w: number;
  h: number;
  /** How many cards the outline encloses. */
  count: number;
  /** Free space above and below the cards, which is where a label can go. */
  padTop: number;
  padBottom: number;
}

/** Room left round the cards, and above them for the label. */
const PAD_X = 18;
const PAD_TOP = 26;
const PAD_BOTTOM = 16;

/**
 * The least space left between two outlines that are not nested.
 *
 * Below this the two dashed lines read as one doubled line, which says neither
 * of the two things they are each there to say.
 */
const SEPARATION = 24;

/**
 * Two cards are on the same row when their tops are within this of each other.
 *
 * Generous, because a card can be dragged: an estate someone has rearranged by
 * hand should still group, and a card pulled clear of its row is meant to fall
 * out of the outline rather than stretch it.
 */
const ROW_TOLERANCE = NODE_H * 0.6;

export function zoneAreas(nodes: NetNode[]): ZoneArea[] {
  if (nodes.length === 0) return [];

  // Rows, by where the cards actually sit rather than by what the layout
  // intended: a dragged card belongs to the row it was dropped in.
  const rows: NetNode[][] = [];
  for (const node of [...nodes].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0]!.y - node.y) <= ROW_TOLERANCE) row.push(node);
    else rows.push([node]);
  }

  const areas: ZoneArea[] = [];
  for (const row of rows) {
    const ordered = [...row].sort((a, b) => a.x - b.x);

    // The runs first, then the padding: how much room an outline may take on
    // each side depends on what its neighbour left free.
    const runs: NetNode[][] = [];
    for (const node of ordered) {
      const run = runs[runs.length - 1];
      const previous = run?.[run.length - 1];
      /*
       * A run ends where another zone begins — or where another family does.
       *
       * Empty space between two cards of the same zone claims nothing about
       * anybody, so the outline keeps it. But the two families sit in their
       * own columns, and a management card on each side of the gutter would
       * otherwise be gathered into one box reaching across both family
       * outlines: an inner boundary crossing an outer one, which says the two
       * are the same group when the map has just said they are not.
       */
      const breaks =
        previous === undefined ||
        previous.zone !== node.zone ||
        familyOf(previous.kind) !== familyOf(node.kind);
      if (breaks) runs.push([node]);
      else run!.push(node);
    }

    const bounds = runs.map((run) => ({
      left: Math.min(...run.map((n) => n.x)),
      right: Math.max(...run.map((n) => n.x + NODE_W)),
      top: Math.min(...run.map((n) => n.y)),
      bottom: Math.max(...run.map((n) => n.y + NODE_H)),
    }));

    /*
     * Two outlines that all but touch read as one thick line, so where the
     * cards are close the outline gives up padding rather than the gap: half
     * the free space each, never less than a hair and never more than the
     * padding it would have taken anyway.
     */
    const sidePad = (gap: number | null) =>
      gap === null ? PAD_X : Math.max(4, Math.min(PAD_X, (gap - SEPARATION) / 2));

    runs.forEach((run, i) => {
      const before = i > 0 ? bounds[i - 1]!.right : null;
      const after = i + 1 < runs.length ? bounds[i + 1]!.left : null;
      const box = bounds[i]!;

      const padLeft = sidePad(before === null ? null : box.left - before);
      const padRight = sidePad(after === null ? null : after - box.right);

      areas.push({
        zone: run[0]!.zone,
        family: familyOf(run[0]!.kind),
        x: box.left - padLeft,
        y: box.top - PAD_TOP,
        w: box.right - box.left + padLeft + padRight,
        h: box.bottom - box.top + PAD_TOP + PAD_BOTTOM,
        count: run.length,
        padTop: PAD_TOP,
        padBottom: PAD_BOTTOM,
      });
    });
  }

  return areas;
}

/* ------------------------------------------------------------------ family */

/**
 * Which system a card belongs to.
 *
 * The coarser of the two groupings, and the one someone looks for first: the
 * hypervisor with everything on it, the controller with everything it manages,
 * and the way out. A zone says which network a card is on; this says whose
 * card it is.
 */
export type NodeFamily = 'internet' | 'unifi' | 'proxmox';

export function familyOf(kind: NetNode['kind']): NodeFamily {
  switch (kind) {
    case 'cloud':
      return 'internet';
    case 'gateway':
    case 'switch':
    case 'ap':
    case 'clients':
      return 'unifi';
    default:
      return 'proxmox';
  }
}

export interface FamilyArea {
  family: NodeFamily;
  x: number;
  y: number;
  w: number;
  h: number;
  count: number;
  /** Free space above and below the cards, which is where a label can go. */
  padTop: number;
  padBottom: number;
}

/*
 * Room round a family, outside whatever zone outlines are inside it.
 *
 * The gap between the two boundaries is what these numbers are really for: at
 * a dozen pixels the inner and the outer line ran side by side and read as one
 * doubled dashed line, which is worse than either on its own. They are set so
 * that the two are plainly separate lines at any zoom the map is read at.
 */
const FAMILY_PAD_X = 48;
/*
 * Room enough for two labels above the same corner.
 *
 * The family's label sits on the outer boundary and the first zone's on the
 * inner one, and at the first spacing tried they overlapped — two names on top
 * of each other, which is worse than either alone.
 */
const FAMILY_PAD_TOP = 62;
const FAMILY_PAD_BOTTOM = 38;

/*
 * Vertically the padding alone cannot keep two families apart: one on the row
 * above and one on the row below would each reach towards the same empty band
 * and meet in the middle of it. So a family box also stops short of the
 * midline between its row and the next, by half of SEPARATION.
 */

interface RowSpan {
  index: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  count: number;
  /** Cards of every other family on that row, for the overlap test. */
  others: NetNode[];
}

/**
 * One rectangle round a whole family.
 *
 * A rectangle, and as few of them as the estate allows: an outline that steps
 * in and out on every row is harder to follow than the cards it was meant to
 * help with, and the layout now keeps each family in its own column precisely
 * so that one straight box fits round it.
 *
 * A rectangle is only kept if it touches no card of another family. Where one
 * would, the family is split into as few boxes as it takes — that is a real
 * fact about the map, not a drawing failure, and it is drawn rather than
 * fudged.
 *
 * A row the family skips is bridged rather than ending the box: a hypervisor
 * with nothing on the access-point row is still one hypervisor, and two boxes
 * with a gap between them says something about it that is not true.
 */
export function familyAreas(nodes: NetNode[]): FamilyArea[] {
  if (nodes.length === 0) return [];

  const rows: NetNode[][] = [];
  for (const node of [...nodes].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0]!.y - node.y) <= ROW_TOLERANCE) row.push(node);
    else rows.push([node]);
  }

  const areas: FamilyArea[] = [];

  for (const family of ['internet', 'unifi', 'proxmox'] as NodeFamily[]) {
    const spans: RowSpan[] = rows.map((row, index) => {
      const mine = row.filter((n) => familyOf(n.kind) === family);
      const others = row.filter((n) => familyOf(n.kind) !== family);
      const top = Math.min(...row.map((n) => n.y));
      const bottom = Math.max(...row.map((n) => n.y + NODE_H));
      return {
        index,
        left: mine.length > 0 ? Math.min(...mine.map((n) => n.x)) : Number.POSITIVE_INFINITY,
        right: mine.length > 0 ? Math.max(...mine.map((n) => n.x + NODE_W)) : Number.NEGATIVE_INFINITY,
        top,
        bottom,
        count: mine.length,
        others,
      };
    });

    /** Whether a box of this width would cut through anybody else's card. */
    const clear = (block: RowSpan[], left: number, right: number) =>
      block.every((row) =>
        row.others.every((n) => n.x + NODE_W <= left || n.x >= right),
      );

    let block: RowSpan[] = [];
    let left = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;

    const flush = () => {
      // Rows the family skips at the end of a block are not part of it: the
      // box stops at the last card, not at the last row it passed through.
      while (block.length > 0 && block[block.length - 1]!.count === 0) block.pop();
      if (block.length === 0) {
        left = Number.POSITIVE_INFINITY;
        right = Number.NEGATIVE_INFINITY;
        return;
      }

      const first = block[0]!;
      const last = block[block.length - 1]!;
      const above = spans[first.index - 1];
      const below = spans[last.index + 1];

      // Stop short of the midline between this row and the next, so a family
      // above and a family below cannot reach into the same empty band.
      const top = Math.max(
        first.top - FAMILY_PAD_TOP,
        above ? (above.bottom + first.top) / 2 + SEPARATION / 2 : -Infinity,
      );
      const bottom = Math.min(
        last.bottom + FAMILY_PAD_BOTTOM,
        below ? (last.bottom + below.top) / 2 - SEPARATION / 2 : Infinity,
      );

      areas.push({
        family,
        x: left - FAMILY_PAD_X,
        y: top,
        w: right - left + FAMILY_PAD_X * 2,
        h: bottom - top,
        count: block.reduce((sum, row) => sum + row.count, 0),
        // What the clamping left, not what the padding asked for.
        padTop: first.top - top,
        padBottom: bottom - last.bottom,
      });
      block = [];
      left = Number.POSITIVE_INFINITY;
      right = Number.NEGATIVE_INFINITY;
    };

    for (const row of spans) {
      if (block.length === 0 && row.count === 0) continue;

      const nextLeft = Math.min(left, row.left);
      const nextRight = Math.max(right, row.right);
      if (clear([...block, row], nextLeft - FAMILY_PAD_X, nextRight + FAMILY_PAD_X)) {
        block.push(row);
        left = nextLeft;
        right = nextRight;
        continue;
      }

      // This row cannot join without the box cutting through someone else.
      flush();
      if (row.count > 0) {
        block = [row];
        left = row.left;
        right = row.right;
      }
    }
    flush();
  }

  return areas;
}

/* ------------------------------------------------------------------ labels */

export interface LabelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/*
 * Where a boundary's name goes.
 *
 * The corner is the natural place for it and not always a free one: a cable
 * comes down into the first card of a group, and the port number riding on
 * that cable lands exactly where the name wants to be. A label under a chip is
 * unreadable and the chip is the more important of the two — it belongs to a
 * specific cable, while the name belongs to a whole area that has three other
 * corners to put it in.
 *
 * So each corner is tried in turn and the first free one is taken. If a group
 * is boxed in on all four, the first corner is used anyway: a label somewhere
 * is better than none, and that case means the map is dense enough that the
 * reader is zooming in regardless.
 */

/*
 * How large a label comes out.
 *
 * Measured off the rendered chips rather than guessed: the first version
 * under-estimated by a few pixels each way, which is all it takes for a name
 * to sit on the card below it. Both numbers err on the generous side, since
 * over-estimating only makes the placement more careful.
 */
/**
 * The four lines of an outline, as bands a label must keep off.
 *
 * A name may sit inside a boundary; it may not sit *on* one. The inner
 * outline's line running through the outer one's name is the same mistake as a
 * name under a port chip — two things drawn on top of each other, neither
 * readable.
 */
export function outlineEdges(box: { x: number; y: number; w: number; h: number }): LabelBox[] {
  const t = 6;
  return [
    { x: box.x, y: box.y - t / 2, w: box.w, h: t },
    { x: box.x, y: box.y + box.h - t / 2, w: box.w, h: t },
    { x: box.x - t / 2, y: box.y, w: t, h: box.h },
    { x: box.x + box.w - t / 2, y: box.y, w: t, h: box.h },
  ];
}

export function labelSize(text: string, outer: boolean): { w: number; h: number } {
  return outer
    ? { w: text.length * 7 + 38, h: 24 }
    : // The inner labels carry a dot before the text.
      { w: text.length * 7.5 + 36, h: 21 };
}

/** How far in from the corner the label sits. */
const LABEL_INSET = 13;
/** Clear space a label needs beyond its own height, so it never grazes a card. */
const LABEL_AIR = 4;
/** How far the search slides the label along a band before trying again. */
const LABEL_STEP = 18;

/**
 * Where a name goes.
 *
 * Two kinds of thing are in the way, and they are not equally in the way. A
 * port chip, a card or another name must not be covered at all — each is
 * something to read in its own right. Another outline's line is different: the
 * name has a solid ground behind it, so a line it lands on is hidden rather
 * than muddled, which is a poor second best but better than covering a chip.
 *
 * So the search runs twice: once avoiding everything, and once avoiding only
 * what must not be covered.
 */
export function labelSpot(
  box: { x: number; y: number; w: number; h: number; padTop: number; padBottom: number },
  size: { w: number; h: number },
  blockers: LabelBox[],
  lines: LabelBox[] = [],
): LabelBox {
  const { w, h } = size;
  const left = box.x + LABEL_INSET;
  const right = box.x + box.w - w - LABEL_INSET;

  /*
   * Only the bands the cards leave free.
   *
   * A label is not allowed to reach into the row of cards: below a zone
   * outline there is barely a dozen pixels, and a name placed there lands on
   * the card rather than beside it. So a corner is only a candidate where the
   * padding on that side can hold the label whole.
   */
  /*
   * The bands a name may sit in, best first.
   *
   * Inside the boundary is where it belongs, in whichever of the two padding
   * strips can hold it whole — reaching into the row of cards is never
   * allowed. Failing both, just outside the line: that band is empty by
   * construction, being the space between two rows of cards, and a name
   * against the line from the other side reads just as well. Only there may it
   * also slide past the boundary's own ends, since a narrow group with a cable
   * coming into it has no free stretch of its own width anywhere.
   */
  const bands: { y: number; wide: boolean }[] = [];
  if (box.padTop >= h + LABEL_AIR) {
    bands.push({ y: box.y + Math.min(5, box.padTop - h - LABEL_AIR), wide: false });
  }
  if (box.padBottom >= h + LABEL_AIR) {
    bands.push({ y: box.y + box.h - h - Math.min(5, box.padBottom - h - LABEL_AIR), wide: false });
  }
  bands.push({ y: box.y - h - 3, wide: true }, { y: box.y + box.h + 3, wide: true });

  /*
   * Along the band, not only at its ends.
   *
   * Two corners are not enough on a wide group: a cable comes down into the
   * first card and another into the last, and both port chips sit exactly in a
   * corner. Sliding along the band finds the gap between them, which is
   * usually the widest empty stretch on the whole outline.
   */
  const corners: LabelBox[] = [];
  for (const band of bands) {
    const from = band.wide ? left - w / 2 : left;
    const to = band.wide ? right + w / 2 : right;
    if (to <= from) {
      corners.push({ x: left, y: band.y, w, h });
      continue;
    }
    const steps = Math.max(1, Math.round((to - from) / LABEL_STEP));
    for (let i = 0; i <= steps; i++) {
      corners.push({ x: from + ((to - from) * i) / steps, y: band.y, w, h });
    }
  }
  if (corners.length === 0) corners.push({ x: left, y: box.y + 2, w, h });

  const hits = (a: LabelBox, b: LabelBox) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  const clearOf = (against: LabelBox[]) => corners.find((c) => !against.some((b) => hits(c, b)));

  return clearOf([...blockers, ...lines]) ?? clearOf(blockers) ?? corners[0]!;
}
