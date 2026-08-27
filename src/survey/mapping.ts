import type {
  BackupEvidence,
  BackupJob,
  BackupSummary,
  ConnectionProfile,
  FirewallRule,
  MatrixCell,
  NetLink,
  NetNode,
  NodeKind,
  Provenance,
  Recommendation,
  Risk,
  ScanLogEntry,
  SecuritySignal,
  Zone,
  ZoneKey,
} from '@/data/model';
import type { Dict } from '@/i18n';
import { recommendationsFromSnapshot } from './advice';
import {
  combinedReachability,
  readLiveEstate,
  type LiveEstate,
  type LiveFirewall,
  type LiveVerdict,
} from './liveFirewall';
import { CANVAS_W, NODE_W } from '@/lib/geometry';
import { familyOf } from '@/lib/zones';
import type { Tone } from '@/lib/palette';
import {
  takesBackups,
  type Profile,
  type ProxmoxSnapshot,
  type SurveySnapshot,
  type UnifiClient,
  type UnifiDevice,
  type UnifiSnapshot,
  type UnifiWan,
} from './model';

/*
 * Raw measurements → estate.
 *
 * The rule this file follows: anything read directly from an API is
 * "Felmért"; anything the application concluded is "Becsült"; anything the
 * application cannot prove with read-only access is "Nem ellenőrzött". A
 * firewall rule read from configuration is *not* evidence that the rule takes
 * effect, so rules land in the third category even though they were read
 * cleanly.
 */

export interface Estate {
  source: 'demo' | 'survey';
  surveyedAt?: string;
  nodes: NetNode[];
  links: NetLink[];
  zones: Zone[];
  matrix: MatrixCell[][];
  /** Explains why the matrix looks the way it does. */
  matrixNote: string;
  /**
   * Whether the gateway's loaded ruleset was read at all.
   *
   * Distinguishes the two ways nothing gets verified, which look identical in a
   * count and call for opposite actions: no ruleset was read, or one was read
   * and matched nothing. The first is a matter of access, the second of what
   * the gateway logs.
   */
  liveRead: boolean;
  rules: FirewallRule[];
  signals: SecuritySignal[];
  risks: Risk[];
  /** What to do about the risks, worst first. */
  recommendations: Recommendation[];
  scanLog: ScanLogEntry[];
  profiles: ConnectionProfile[];
  counts: Record<Tone, number>;
  /** Headline counters for the overview. */
  stats: EstateStat[];
  /** Capacity bars for the overview. */
  capacity: EstateBar[];
  /** Set when capacity figures are missing, saying what was and was not read. */
  capacityNote?: string;
  /** What could be established about backups. */
  backups: BackupSummary;
}

export interface EstateStat {
  label: string;
  value: string;
  suffix?: string;
  hint: string;
  tone?: Tone;
}

export interface EstateBar {
  label: string;
  value: string;
  percent: number;
  /** `accent` means "nothing wrong", and follows the theme colour. */
  tone: Tone | 'accent';
}

/* ------------------------------------------------------------------ layout */

const COL_GAP = 80;
/*
 * The gap between the network's column and the hypervisor's.
 *
 * Wider than the gap between two cards, because it is the seam the two family
 * outlines run along: at a card's own spacing the two boundaries would touch,
 * and a boundary that touches another reads as one shape.
 */
const COLUMN_GAP = 150;
/*
 * Row spacing.
 *
 * Set by what has to fit in the band between two rows, not by taste: a zone
 * boundary, the family boundary outside it, the gap that keeps the two apart,
 * and the same again for the row below — with the two families' boundaries
 * still clear of each other in the middle.
 */
const ROW_H = 200;
const MAX_PER_ROW = 6;

interface Draft extends Omit<NetNode, 'x' | 'y'> {
  x?: number;
  y?: number;
}

/** Marks a placeholder standing in for a cable passing through a tier. */
const VIRTUAL = '~lane:';

/**
 * A position in a tier: either a device, or a channel held clear for a cable
 * on its way past.
 */
type Slot = { node: Draft; lane?: undefined } | { lane: string; node?: undefined };

/** How much room a pass-through channel takes. Narrower than a card. */
const LANE_W = 48;

/**
 * Counts how many cables cross between two neighbouring tiers.
 *
 * Two edges cross exactly when their endpoints are in opposite order on the
 * two tiers, which is all this has to check — the drawn curve bends, but it
 * cannot undo an inversion.
 */
function crossingsBetween(upper: string[], lower: string[], edges: [string, string][]): number {
  const up = new Map(upper.map((id, i) => [id, i]));
  const down = new Map(lower.map((id, i) => [id, i]));

  const drawn = edges
    .map(([a, b]) => [up.get(a), down.get(b)] as const)
    .filter((p): p is readonly [number, number] => p[0] !== undefined && p[1] !== undefined);

  let count = 0;
  for (let i = 0; i < drawn.length; i++) {
    for (let j = i + 1; j < drawn.length; j++) {
      const [a1, b1] = drawn[i]!;
      const [a2, b2] = drawn[j]!;
      if ((a1 - a2) * (b1 - b2) < 0) count += 1;
    }
  }
  return count;
}

/**
 * Orders each tier so cables run down the map without crossing each other.
 *
 * Left alone, the tiers keep the order they were collected in — every switch,
 * then every access point — so an AP uplinked to the rightmost switch can be
 * drawn on the far left and its cable crosses the whole map.
 *
 * Three things do the work, and they are the standard layered-drawing
 * treatment:
 *
 *   Cables that skip a tier get a placeholder in each tier they pass through.
 *   Without one such a cable takes no part in the ordering at all — nothing
 *   holds a lane open for it — and it ends up crossing everything between its
 *   two ends. This is what a gateway wired straight to an access point does.
 *
 *   Each tier then moves to the average, and separately to the median, of what
 *   it connects to. Neither wins everywhere, so both are tried and whichever
 *   arrangement actually measures fewer crossings is the one kept.
 *
 *   Finally neighbouring pairs are swapped wherever swapping helps, which
 *   clears up what the averaging leaves behind.
 */
function orderTiers(tiers: Draft[][], links: NetLink[]): Slot[][] {
  const layerOf = new Map<string, number>();
  tiers.forEach((tier, i) => tier.forEach((n) => layerOf.set(n.id, i)));

  /*
   * Which column each card ends up in, decided here rather than at placement.
   *
   * The layout puts the network on the left and the hypervisor on the right,
   * and if the ordering below did not know that, it would spend its effort
   * arranging a row that is never drawn: the placement would then split the
   * row into its two columns and undo the arrangement, crossings and all. So
   * the column is a constraint from the start — every step below reorders
   * within a column and never across the seam between them.
   */
  const columnOf = new Map<string, number>();
  tiers.forEach((tier) =>
    tier.forEach((n) => columnOf.set(n.id, familyOf(n.kind) === 'proxmox' ? 1 : 0)),
  );
  const column = (id: string) => columnOf.get(id) ?? 0;

  // Ids per layer, placeholders included.
  const order: string[][] = tiers.map((tier) =>
    [...tier].sort((a, b) => column(a.id) - column(b.id)).map((n) => n.id),
  );
  // Edges between each layer and the one below it.
  const between: [string, string][][] = tiers.map(() => []);

  links.forEach((link, index) => {
    const from = layerOf.get(link.from);
    const to = layerOf.get(link.to);
    if (from === undefined || to === undefined || from === to) return;

    const [top, bottom] = from < to ? [from, to] : [to, from];
    const [head, tail] = from < to ? [link.from, link.to] : [link.to, link.from];

    let previous = head;
    // A cable passing a tier keeps its channel in its own column: the two ends
    // agree where they are, and where they do not the network side is the one
    // the cable is passing through.
    const laneColumn = Math.min(column(link.from), column(link.to));
    for (let layer = top + 1; layer < bottom; layer++) {
      const stand = `${VIRTUAL}${index}:${layer}`;
      columnOf.set(stand, laneColumn);
      order[layer]!.push(stand);
      between[layer - 1]!.push([previous, stand]);
      previous = stand;
    }
    between[bottom - 1]!.push([previous, tail]);
  });

  const neighbours = new Map<string, { up: string[]; down: string[] }>();
  const slot = (id: string) => {
    let entry = neighbours.get(id);
    if (!entry) neighbours.set(id, (entry = { up: [], down: [] }));
    return entry;
  };
  between.forEach((edges) => {
    for (const [a, b] of edges) {
      slot(a).down.push(b);
      slot(b).up.push(a);
    }
  });

  /*
   * How far apart two devices on the same tier are left.
   *
   * A cable that runs along a tier — a switch to the switch beside it, or a
   * hypervisor to the switch it is plugged into — has to cross everything
   * standing between its two ends. The sweeps above cannot see such a cable at
   * all, because they order each tier against the tiers above and below, and
   * both ends of this one are in the same row.
   *
   * So it is counted here instead: every position between the two ends costs,
   * and the swapping pass has a reason to bring them together. Adjacent costs
   * nothing, which is the whole aim.
   */
  const alongTier: [string, string][][] = tiers.map(() => []);
  for (const link of links) {
    const layer = layerOf.get(link.from);
    if (layer === undefined || layer !== layerOf.get(link.to) || link.from === link.to) continue;
    alongTier[layer]!.push([link.from, link.to]);
  }

  const spread = (index: number) => {
    const layer = order[index];
    if (!layer) return 0;
    const at = new Map(layer.map((id, i) => [id, i]));
    let sum = 0;
    for (const [a, b] of alongTier[index] ?? []) {
      const x = at.get(a);
      const y = at.get(b);
      if (x === undefined || y === undefined) continue;
      sum += Math.max(0, Math.abs(x - y) - 1);
    }
    return sum;
  };

  /*
   * A cable stretched along a tier is not one problem but several.
   *
   * It passes over every card between its two ends, and over whatever those
   * cards are wired to — so each position it spans is worth about as much as a
   * crossing on its own. Weighting it below a single crossing, as this first
   * did, left a hypervisor at one end of a row and the switch it is plugged
   * into at the other, with everything else arching over the gap.
   */
  const CROSSING_WEIGHT = 10;
  const SPREAD_WEIGHT = 9;
  /*
   * How far apart two connected cards are left.
   *
   * Crossings and stretched tier cables are about the tangle; this is about
   * the reading. A cable that runs the width of the map is followed with a
   * finger even when it crosses nothing, so every arrangement is also scored
   * on the plain horizontal distance between the two ends of each cable —
   * measured in card widths, and worth less than a crossing, so it decides
   * between arrangements that are otherwise as untangled as each other.
   */
  const NEAR_WEIGHT = 2;

  /**
   * Roughly where each card will land.
   *
   * Mirrors what the placement does with the two columns: a family keeps its
   * own band, and a row's block is centred inside it. Approximate on purpose —
   * it is a comparison between arrangements, not a drawing.
   */
  const estimateX = (): Map<string, number> => {
    const widthOf = (id: string) => (id.startsWith(VIRTUAL) ? LANE_W : NODE_W);
    const blocks = order.map((layer) => {
      const columns: [string[], string[]] = [[], []];
      for (const id of layer) columns[column(id) === 1 ? 1 : 0]!.push(id);
      return columns;
    });
    const spanOf = (ids: string[]) =>
      ids.length === 0
        ? 0
        : ids.reduce((sum, id) => sum + widthOf(id), 0) + (ids.length - 1) * COL_GAP;
    const columnSpan = [
      Math.max(0, ...blocks.map(([left]) => spanOf(left))),
      Math.max(0, ...blocks.map(([, right]) => spanOf(right))),
    ];
    const gutter = columnSpan[0]! > 0 && columnSpan[1]! > 0 ? COLUMN_GAP : 0;
    const startOf = [0, columnSpan[0]! + gutter];

    const at = new Map<string, number>();
    for (const [left, right] of blocks) {
      [left, right].forEach((ids, c) => {
        let x = startOf[c]! + (columnSpan[c]! - spanOf(ids)) / 2;
        for (const id of ids) {
          at.set(id, x + widthOf(id) / 2);
          x += widthOf(id) + COL_GAP;
        }
      });
    }
    return at;
  };

  /** Total horizontal distance of every cable, in card widths. */
  const stretch = () => {
    const at = estimateX();
    let sum = 0;
    for (const edges of between) {
      for (const [a, b] of edges) {
        const x = at.get(a);
        const y = at.get(b);
        if (x === undefined || y === undefined) continue;
        sum += Math.abs(x - y) / (NODE_W + COL_GAP);
      }
    }
    return sum;
  };

  const total = () =>
    between.reduce(
      (sum, edges, i) =>
        sum + crossingsBetween(order[i]!, order[i + 1] ?? [], edges) * CROSSING_WEIGHT,
      0,
    ) +
    order.reduce((sum, _, i) => sum + spread(i) * SPREAD_WEIGHT, 0) +
    stretch() * NEAR_WEIGHT;

  const snapshot = () => order.map((layer) => [...layer]);
  let best = snapshot();
  let bestCount = total();

  /** Moves one layer onto the average or median of what it is wired to. */
  const sweep = (index: number, from: 'up' | 'down', how: 'mean' | 'median') => {
    const layer = order[index];
    const reference = order[from === 'up' ? index - 1 : index + 1];
    if (!layer || !reference || reference.length === 0) return;

    const position = new Map(reference.map((id, i) => [id, i]));
    const scale = layer.length > 1 ? (reference.length - 1) / (layer.length - 1) : 1;

    const keyed = layer.map((id, i) => {
      const seen = (neighbours.get(id)?.[from] ?? [])
        .map((other) => position.get(other))
        .filter((p): p is number => p !== undefined)
        .sort((a, b) => a - b);

      // Nothing to follow: hold this place, mapped onto the reference tier's
      // scale so unconnected nodes interleave rather than clump at one end.
      if (seen.length === 0) return { id, key: i * scale, i };
      const key =
        how === 'mean'
          ? seen.reduce((a, b) => a + b, 0) / seen.length
          : seen.length % 2 === 1
            ? seen[(seen.length - 1) / 2]!
            : (seen[seen.length / 2 - 1]! + seen[seen.length / 2]!) / 2;
      return { id, key, i };
    });

    keyed.sort((a, b) => column(a.id) - column(b.id) || a.key - b.key || a.i - b.i);
    order[index] = keyed.map((k) => k.id);
  };

  for (let pass = 0; pass < 8; pass++) {
    const how = pass % 2 === 0 ? 'mean' : 'median';
    for (let i = 1; i < order.length; i++) sweep(i, 'up', how);
    for (let i = order.length - 2; i >= 0; i--) sweep(i, 'down', how);

    // Swapping neighbours clears up what averaging cannot. The objective
    // includes cables running along the tier, which the sweeps cannot see.
    const localCost = (i: number) =>
      (i > 0 ? crossingsBetween(order[i - 1]!, order[i]!, between[i - 1]!) : 0) * CROSSING_WEIGHT +
      (i + 1 < order.length
        ? crossingsBetween(order[i]!, order[i + 1]!, between[i]!) * CROSSING_WEIGHT
        : 0) +
      spread(i) * SPREAD_WEIGHT +
      stretch() * NEAR_WEIGHT;

    for (let round = 0; round < 6; round++) {
      let improved = false;
      for (let i = 0; i < order.length; i++) {
        const layer = order[i]!;
        for (let j = 0; j + 1 < layer.length; j++) {
          // Never across the seam: the placement would put them back.
          if (column(layer[j]!) !== column(layer[j + 1]!)) continue;
          const before = localCost(i);
          [layer[j], layer[j + 1]] = [layer[j + 1]!, layer[j]!];
          if (localCost(i) < before) improved = true;
          else [layer[j], layer[j + 1]] = [layer[j + 1]!, layer[j]!];
        }
      }
      if (!improved) break;
    }

    /*
     * Bring the two ends of a tier cable together.
     *
     * Swapping neighbours cannot do this. With a hypervisor at one end of a row
     * and its switch at the other, every single swap leaves the total exactly
     * where it was — the pair gets one position closer and some other pair one
     * further — so a search that only accepts strict improvements sits on that
     * plateau forever, while the arrangement two moves away is plainly better.
     *
     * Lifting one end out and setting it down beside the other crosses the
     * plateau in one step. Every placement is scored on the whole objective, so
     * this cannot trade a tidy row for a tangle above it.
     */
    for (const [layerIndex, edges] of alongTier.entries()) {
      const layer = order[layerIndex];
      if (!layer) continue;

      for (const [a, b] of edges) {
        if (Math.abs(layer.indexOf(a) - layer.indexOf(b)) <= 1) continue;

        let best = snapshot();
        let bestScore = total();

        for (const [moving, anchor] of [
          [a, b],
          [b, a],
        ]) {
          const without = order[layerIndex]!.filter((id) => id !== moving);
          const at = without.indexOf(anchor);
          if (at < 0) continue;

          /*
           * Beside the anchor, or as near to it as the column allows.
           *
           * A cable along the tier often runs between the columns — a
           * hypervisor and the switch it is plugged into — and the two ends
           * cannot be brought together without crossing the seam. Landing the
           * card at the edge of its own column that faces the anchor is the
           * whole of the improvement that is available, and it is a large one:
           * the cable then spans the gutter and nothing else.
           */
          const sameColumn = column(moving!) === column(anchor!);
          const mine = without
            .map((id, i) => (column(id) === column(moving!) ? i : -1))
            .filter((i) => i >= 0);
          const edge = at < (mine[0] ?? 0) ? (mine[0] ?? 0) : (mine[mine.length - 1] ?? 0) + 1;
          const places = sameColumn ? [at, at + 1] : [edge];

          for (const where of places) {
            const before = snapshot();
            order[layerIndex] = [...without.slice(0, where), moving, ...without.slice(where)];

            /*
             * Let the rest of the map settle before judging the move.
             *
             * This is what the search was missing. Sliding a switch across its
             * row leaves the cards it feeds where they were, so the move is
             * scored with every one of its cables stretched across the map —
             * and rejected, even where moving the switch *and* what hangs off
             * it is plainly better. A pair that has to move together can never
             * be found one card at a time.
             *
             * So the neighbouring rows are swept onto the new arrangement
             * first, and the score is of the settled map. The move is kept
             * only if that is better; otherwise everything goes back.
             */
            for (let i = layerIndex + 1; i < order.length; i++) sweep(i, 'up', 'mean');
            for (let i = layerIndex - 1; i >= 0; i--) sweep(i, 'down', 'mean');

            const score = total();
            if (score < bestScore) {
              bestScore = score;
              best = snapshot();
            }
            before.forEach((row, i) => {
              order[i] = row;
            });
          }
        }
        best.forEach((row, i) => {
          order[i] = row;
        });
      }
    }

    const count = total();
    if (count < bestCount) {
      bestCount = count;
      best = snapshot();
    }
    if (bestCount === 0) break;
  }

  /*
   * Cards of the same zone, side by side — where it costs nothing.
   *
   * The map is read in two ways at once: which cable goes where, and what
   * belongs with what. The ordering above answers the first and is blind to
   * the second, so a row could come out as switch · store · host · bridge —
   * management and servers interleaved, and no way to draw an outline round
   * either without enclosing the other.
   *
   * So each row is offered a version of itself with its zones gathered, and it
   * is kept only when the whole objective — crossings and stretched cables —
   * says it is no worse. Tidiness never buys itself a tangle; where the two
   * disagree, the cables win, and that row simply gets two outlines instead of
   * one.
   */
  const zoneOfId = new Map(tiers.flat().map((n) => [n.id, n.zone]));
  order.forEach((_, i) => {
    order[i] = [...best[i]!];
  });
  let zoned = total();

  for (let i = 0; i < order.length; i++) {
    const layer = order[i]!;
    const cards = layer.filter((id) => !id.startsWith(VIRTUAL));
    if (cards.length < 3) continue;

    // Zones in the order they first appear, so the arrangement the sweeps
    // arrived at is disturbed as little as gathering allows.
    const byZone = new Map<string, string[]>();
    for (const id of cards) {
      // Keyed by column first: a zone that appears on both sides of the seam
      // must stay two groups, or gathering would drag a card across it.
      const zone = `${column(id)}:${zoneOfId.get(id) ?? ''}`;
      const group = byZone.get(zone);
      if (group) group.push(id);
      else byZone.set(zone, [id]);
    }
    const gathered = [...byZone.values()].flat();
    if (gathered.join('|') === cards.join('|')) continue;

    // The channels keep their positions; only the cards move between them.
    let k = 0;
    const candidate = layer.map((id) => (id.startsWith(VIRTUAL) ? id : gathered[k++]!));
    order[i] = candidate;

    const cost = total();
    if (cost <= zoned) {
      zoned = cost;
      best[i] = [...candidate];
    } else {
      order[i] = layer;
    }
  }

  /*
   * A channel may not open up inside a cable that runs along the tier.
   *
   * Two switches wired to each other sit side by side, and the cable between
   * them is drawn straight across. Parking a pass-through channel in that gap
   * trades one crossing for another, so any channel that lands between such a
   * pair is moved out to the near side of it.
   */
  const sameTier = links
    .map((l) => [layerOf.get(l.from), l.from, l.to] as const)
    .filter(([layer, from, to]) => layer !== undefined && layer === layerOf.get(to) && from !== to);

  for (const [layer, from, to] of sameTier) {
    const row = best[layer!];
    if (!row) continue;
    const a = row.indexOf(from);
    const b = row.indexOf(to);
    if (a < 0 || b < 0) continue;
    const [low, high] = a < b ? [a, b] : [b, a];
    const trapped = row.slice(low + 1, high).filter((id) => id.startsWith(VIRTUAL));
    if (trapped.length === 0) continue;
    best[layer!] = [
      ...row.slice(0, low + 1).filter((id) => !trapped.includes(id)),
      ...row.slice(low + 1, high).filter((id) => !trapped.includes(id)),
      ...row
        .slice(high)
        .filter((id) => !trapped.includes(id))
        .slice(0, 1),
      ...trapped,
      ...row.slice(high + 1).filter((id) => !trapped.includes(id)),
    ];
  }

  /*
   * The placeholders are kept.
   *
   * They are not drawn, but they have to keep their place: their whole purpose
   * is to hold a channel open between two cards for the cable passing through,
   * and dropping them here would close the channel again and put the cable
   * straight back across its neighbours.
   */
  const byId = new Map(tiers.flat().map((n) => [n.id, n]));
  return best.map((layer) =>
    layer.map<Slot>((id) => {
      const node = byId.get(id);
      return node ? { node } : { lane: id };
    }),
  );
}

/**
 * Places tiers top to bottom, centred, wrapping wide tiers onto extra lines.
 *
 * Channels take their share of the width without producing a card. That gap is
 * the point: it is where a cable crossing this tier runs, and closing it up
 * would put that cable back over its neighbours.
 */
function placeTiers(tiers: Slot[][], links: NetLink[]): NetNode[] {
  const widthOf = (slot: Slot) => (slot.lane === undefined ? NODE_W : LANE_W);

  /*
   * Two columns: the network, and the hypervisor.
   *
   * Every row used to be centred on its own, so a family's cards sat at a
   * different span on every row — the gateway in the middle, the switches to
   * the left of it, the guests to the right — and there was no shape that
   * enclosed one family without cutting through the other. Fixing the columns
   * fixes that: each family keeps the same band of the canvas all the way
   * down, and the outline round it is a plain rectangle.
   *
   * The way out goes in the network column. It is a card of its own, on a row
   * of its own, and giving it a third column would push the whole map sideways
   * to make room for one card.
   */
  const columnOf = (slot: Slot): 'network' | 'proxmox' =>
    slot.node && familyOf(slot.node.kind) === 'proxmox' ? 'proxmox' : 'network';

  const rows = tiers.map((tier) => {
    const network: Slot[] = [];
    const proxmox: Slot[] = [];
    // A channel belongs to the column of the card it was opened beside, so a
    // cable passing a tier keeps its lane inside the right band.
    let current: 'network' | 'proxmox' = 'network';
    for (const slot of tier) {
      if (slot.node) current = columnOf(slot);
      (current === 'proxmox' ? proxmox : network).push(slot);
    }
    return { network, proxmox };
  });

  const lineWidth = (slots: Slot[]) =>
    slots.length === 0
      ? 0
      : slots.reduce((sum, s) => sum + widthOf(s), 0) + (slots.length - 1) * COL_GAP;

  /** How wide a column has to be: its widest line, once wrapping is applied. */
  const columnWidth = (pick: (row: (typeof rows)[number]) => Slot[]) =>
    Math.max(
      0,
      ...rows.map((row) => {
        const slots = pick(row);
        const cards = slots.filter((s) => s.lane === undefined).length;
        const rowsNeeded = Math.max(1, Math.ceil(cards / MAX_PER_ROW));
        const perLine = Math.max(1, Math.ceil(slots.length / rowsNeeded));
        let widest = 0;
        for (let i = 0; i < slots.length; i += perLine) {
          widest = Math.max(widest, lineWidth(slots.slice(i, i + perLine)));
        }
        return widest;
      }),
    );

  const networkWidth = columnWidth((r) => r.network);
  const proxmoxWidth = columnWidth((r) => r.proxmox);
  const gutter = networkWidth > 0 && proxmoxWidth > 0 ? COLUMN_GAP : 0;
  const startX = Math.round((CANVAS_W - (networkWidth + gutter + proxmoxWidth)) / 2);
  const columnX = {
    network: startX,
    proxmox: startX + networkWidth + gutter,
  };
  const columnW = { network: networkWidth, proxmox: proxmoxWidth };

  let y = 24;

  /** One drawn line: a column's slots on one row, and where the block starts. */
  interface Line {
    column: 'network' | 'proxmox';
    slots: Slot[];
    y: number;
    width: number;
    x: number;
  }
  const drawn: Line[] = [];

  for (const row of rows) {
    if (row.network.length === 0 && row.proxmox.length === 0) continue;

    // Each column wraps on its own, and the tier is as tall as the column that
    // needed the most lines.
    const lines = (slots: Slot[]) => {
      if (slots.length === 0) return [] as Slot[][];
      const cards = slots.filter((s) => s.lane === undefined).length;
      /*
       * Wrapping splits evenly rather than filling the first line.
       *
       * Seven cards at a cap of six came out as six and a stray one below
       * them, which reads as an outlier rather than as a row that did not fit.
       * Four and three is the same information with nothing singled out.
       */
      const rowsNeeded = Math.max(1, Math.ceil(cards / MAX_PER_ROW));
      const perLine = Math.ceil(slots.length / rowsNeeded);
      const out: Slot[][] = [];
      for (let i = 0; i < slots.length; i += perLine) out.push(slots.slice(i, i + perLine));
      return out;
    };

    const network = lines(row.network);
    const proxmox = lines(row.proxmox);

    for (let line = 0; line < Math.max(network.length, proxmox.length); line++) {
      for (const [column, slots] of [
        ['network', network[line]],
        ['proxmox', proxmox[line]],
      ] as const) {
        if (!slots || slots.length === 0) continue;
        const width = lineWidth(slots);
        drawn.push({
          column,
          slots,
          y,
          width,
          // Centred inside its own column to begin with; the pass below slides
          // it to where its cables want it.
          x: columnX[column] + (columnW[column] - width) / 2,
        });
      }
      y += ROW_H;
    }
  }

  /*
   * Sliding each line along until its cables are as short as they can be.
   *
   * Ordering decides who is left of whom; it cannot decide where the row sits.
   * A row with one card in it was centred in its column, so a gateway could end
   * up half a map away from the switch it feeds while the order was perfect —
   * which is what "needlessly far apart" looks like on screen.
   *
   * Each line is offered the median of what its cables ask for, which is the
   * standard treatment and the robust one: an outlier cable pulls the row a
   * little, a majority pulls it all the way. The line never leaves its own
   * column, so the two families keep their bands.
   */
  const centreOf = new Map<string, number>();
  const placeCentres = () => {
    centreOf.clear();
    for (const line of drawn) {
      let x = line.x;
      for (const slot of line.slots) {
        if (slot.node) centreOf.set(slot.node.id, x + NODE_W / 2);
        x += widthOf(slot) + COL_GAP;
      }
    }
  };

  const partners = new Map<string, string[]>();
  for (const link of links) {
    (partners.get(link.from) ?? partners.set(link.from, []).get(link.from)!).push(link.to);
    (partners.get(link.to) ?? partners.set(link.to, []).get(link.to)!).push(link.from);
  }

  for (let pass = 0; pass < 6; pass++) {
    placeCentres();
    const order = pass % 2 === 0 ? drawn : [...drawn].reverse();

    for (const line of order) {
      const wanted: number[] = [];
      for (const slot of line.slots) {
        if (!slot.node) continue;
        const mine = centreOf.get(slot.node.id);
        if (mine === undefined) continue;
        for (const other of partners.get(slot.node.id) ?? []) {
          // Only cables to another line: two cards on this one move together.
          if (line.slots.some((s) => s.node?.id === other)) continue;
          const theirs = centreOf.get(other);
          if (theirs !== undefined) wanted.push(theirs - mine);
        }
      }
      if (wanted.length === 0) continue;

      wanted.sort((a, b) => a - b);
      const middle =
        wanted.length % 2 === 1
          ? wanted[(wanted.length - 1) / 2]!
          : (wanted[wanted.length / 2 - 1]! + wanted[wanted.length / 2]!) / 2;

      const min = columnX[line.column];
      const max = columnX[line.column] + columnW[line.column] - line.width;
      line.x = Math.max(min, Math.min(max, line.x + middle));
      placeCentres();
    }
  }

  const out: NetNode[] = [];
  for (const line of drawn) {
    let x = Math.round(line.x);
    for (const slot of line.slots) {
      if (slot.node) out.push({ ...slot.node, x, y: line.y });
      x += widthOf(slot) + COL_GAP;
    }
  }

  return out;
}

/* ----------------------------------------------------------------- helpers */

const gib = (bytes: number) => bytes / 1024 ** 3;

function bytesLabel(bytes: number): string {
  if (bytes >= 1024 ** 4) return `${(bytes / 1024 ** 4).toFixed(1)} TB`;
  if (bytes >= 1024 ** 3) return `${gib(bytes).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${bytes} B`;
}

function pct(used: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((used / total) * 100);
}

const DAY_MS = 86_400_000;

function ageDays(unixSeconds: number): number {
  return Math.floor((Date.now() - unixSeconds * 1000) / DAY_MS);
}

/**
 * Turns backup jobs and the files they left behind into evidence.
 *
 * The verdict is only ever what the data supports:
 *
 *   Igazolt      a file exists and the store verified it as readable
 *   Részleges    a file exists, but nothing has verified it
 *   Elavult      files exist, but the newest is older than the schedule implies
 *   Hiányzik     the job has produced nothing at all
 *
 * A restore test is deliberately absent from this list. Proxmox does not record
 * one, so the application cannot claim it happened; the view says so rather
 * than showing a number that would look like proof.
 */
function buildBackups(pve: ProxmoxSnapshot | null, t: Dict): BackupSummary {
  const b = t.backupFindings;
  const empty: BackupSummary = {
    jobs: [],
    jobsReadable: false,
    unprotected: [],
    guestCount: 0,
    protectedCount: 0,
    newestAgeDays: null,
    verifiable: false,
    stores: [],
  };
  if (!pve) return empty;

  const files = pve.backupFiles;
  const verifiable = files.some((f) => f.verification !== '');
  const newest = files.reduce((max, f) => Math.max(max, f.ctime), 0);

  const backedUpVmids = new Set(files.map((f) => f.vmid));
  const unprotected = pve.guests
    .filter((g) => !backedUpVmids.has(g.vmid))
    .map((g) => ({ vmid: g.vmid, name: g.name || String(g.vmid) }));

  /** How stale a backup may be before the schedule is clearly not holding. */
  const toleranceDays = (schedule: string): number => {
    const s = schedule.toLowerCase();
    if (s.includes('mon') || s.includes('week') || s.includes('*-*-01')) return 9;
    if (s.includes('hour') || s.includes(':00/')) return 1;
    return 2; // a daily schedule, missing one run
  };

  const jobs: BackupJob[] = pve.backupJobs.map((job) => {
    // Which guests this job covers, so its files can be found.
    const wanted =
      job.selection === 'all'
        ? pve.guests.map((g) => g.vmid)
        : job.selection
            .split(',')
            .map((v) => Number(v.trim()))
            .filter((v) => Number.isFinite(v) && v > 0);
    const excluded = new Set(
      job.exclude
        .split(',')
        .map((v) => Number(v.trim()))
        .filter(Number.isFinite),
    );
    const covered = wanted.filter((v) => !excluded.has(v));

    const mine = files.filter((f) => f.storage === job.storage && covered.includes(f.vmid));
    const newestMine = mine.reduce((max, f) => Math.max(max, f.ctime), 0);
    const failed = mine.some((f) => f.verification === 'failed');
    const verified = mine.some((f) => f.verification === 'ok');
    const age = newestMine > 0 ? ageDays(newestMine) : null;
    const stale = age !== null && age > toleranceDays(job.schedule);

    let evidence: BackupEvidence;
    let reason: string;
    if (!job.enabled) {
      evidence = 'Hiányzik';
      reason = b.jobDisabled;
    } else if (mine.length === 0) {
      evidence = 'Hiányzik';
      reason = b.noFiles;
    } else if (failed) {
      evidence = 'Hiányzik';
      reason = b.verificationFailed;
    } else if (stale) {
      evidence = 'Elavult';
      reason = b.staleFiles(age ?? 0);
    } else if (verified) {
      evidence = 'Igazolt';
      reason = b.verifiedOk(mine.length);
    } else {
      evidence = 'Részleges';
      reason = verifiable ? b.notVerified : b.cannotVerify;
    }

    return {
      name: job.comment || b.jobName(job.id.slice(0, 8)),
      target: job.storage,
      schedule: job.schedule || b.noSchedule,
      lastRun: age === null ? '—' : age === 0 ? b.today : b.daysAgo(age),
      retention: job.retention || '—',
      evidence,
      reason,
    };
  });

  const stores = pve.storages
    .filter(takesBackups)
    .filter((s, i, all) => all.findIndex((o) => o.name === s.name) === i)
    .map((s) => ({
      name: s.name,
      usedPercent: pct(s.used, s.total),
      freeLabel: bytesLabel(s.available),
    }));

  return {
    jobs,
    // Older stored snapshots carry no such flag; treating that as "not read"
    // keeps the view from claiming something the survey never established.
    jobsReadable: pve.backupJobsReadable === true,
    unprotected,
    guestCount: pve.guests.length,
    protectedCount: pve.guests.length - unprotected.length,
    newestAgeDays: newest > 0 ? ageDays(newest) : null,
    verifiable,
    stores,
  };
}

function uptimeLabel(secs: number, t: Dict): string {
  const days = Math.floor(secs / 86400);
  if (days >= 1) return t.findings.days(days);
  return t.findings.hours(Math.floor(secs / 3600));
}

/** UniFi's device `type` maps onto the estate's node kinds. */
function deviceKind(type: string): NodeKind {
  if (['ugw', 'udm', 'uxg', 'ucg'].includes(type)) return 'gateway';
  if (type === 'usw') return 'switch';
  if (type === 'uap') return 'ap';
  return 'switch';
}

function deviceStatus(device: UnifiDevice): Tone {
  if (device.state === 1) return 'ok';
  if (device.state === 0) return 'bad';
  return 'warn';
}

/** Which zone key a fixed address falls into, for the inspector's policy tab. */
function zoneOf(kind: NodeKind): ZoneKey {
  switch (kind) {
    case 'cloud':
      return 'WAN';
    case 'gateway':
    case 'switch':
    case 'ap':
      return 'Mgmt';
    /*
     * The hypervisor goes with what runs on it.
     *
     * Its own address is on the management network, which is what put it here
     * to begin with — but on the map it is the head of the server side, and a
     * card sandwiched between its own bridge and its own store while belonging
     * to a different group of them both is the one arrangement that cannot be
     * outlined at all.
     */
    case 'host':
      return 'Servers';
    case 'clients':
      return 'IoT';
    // A bridge carries whatever its guests are tagged into, so it belongs with
    // the machines on it rather than with the management plane.
    case 'bridge':
      return 'Servers';
    default:
      return 'Servers';
  }
}

/* ------------------------------------------------------------------- nodes */

function proxmoxNodes(
  pve: ProxmoxSnapshot,
  /**
   * VLAN id → the controller's name for it.
   *
   * So a guest tagged into 20 reads "20 · HOME" rather than a number nobody
   * can place. Empty when there is no UniFi side to ask, and the number then
   * stands on its own — which is still the measurement.
   */
  vlanNames: Map<number, string>,
  t: Dict,
): { host: Draft[]; bridges: Draft[]; guests: Draft[]; storage: Draft[] } {
  const f = t.findings;
  const vlanLabel = (vlan: number | null) => {
    if (vlan == null) return f.untagged;
    const name = vlanNames.get(vlan);
    return name ? `${vlan} · ${name}` : String(vlan);
  };
  const host: Draft[] = pve.nodes.map((n) => {
    const storages = pve.storages.filter((s) => s.node === n.name);
    const worst = Math.max(0, ...storages.map((s) => pct(s.used, s.total)));
    const memPct = pct(n.memUsed, n.memTotal);

    return {
      id: `pve:${n.name}`,
      kind: 'host' as NodeKind,
      name: n.name,
      subtitle: pve.version || 'Proxmox VE',
      ip:
        pve.interfaces.find((i) => i.node === n.name && i.address && i.active)?.address ??
        undefined,
      status: n.status !== 'online' ? 'bad' : worst >= 85 || memPct >= 90 ? 'warn' : 'ok',
      // With what runs on it, as `zoneOf` says for every other card of its
      // kind: the host set its own zone here and the two had drifted apart.
      zone: zoneOf('host'),
      facts: [
        { key: f.factVersion, value: pve.version || '—' },
        { key: f.factCpu, value: f.threads(n.cpuCount) },
        { key: f.factUptime, value: uptimeLabel(n.uptimeSecs, t) },
        {
          key: f.factBridges,
          value:
            pve.interfaces
              .filter((i) => i.node === n.name && i.kind === 'bridge')
              .map((i) => `${i.name}${i.vlanAware ? ` (${f.vlanAware})` : ''}`)
              .join(', ') || '—',
        },
      ],
      metrics: [
        {
          label: f.metricCpu,
          value: `${Math.round(n.cpuRatio * 100)}%`,
          percent: Math.round(n.cpuRatio * 100),
        },
        {
          label: f.metricMemory,
          value: `${bytesLabel(n.memUsed)} / ${bytesLabel(n.memTotal)}`,
          percent: memPct,
        },
        ...storages
          .filter((s) => s.total > 0)
          .map((s) => ({
            label: s.name,
            value: `${bytesLabel(s.used)} / ${bytesLabel(s.total)}`,
            percent: pct(s.used, s.total),
          })),
      ],
      services: pve.guests
        .filter((g) => g.node === n.name)
        .map((g) => ({
          name: g.name || `${g.kind} ${g.vmid}`,
          detail: `${g.kind === 'lxc' ? 'LXC' : 'VM'} ${g.vmid} · ${g.status}`,
          status: (g.status === 'running' ? 'ok' : 'warn') as Tone,
          provenance: 'Felmért' as const,
        })),
      warnings: storages
        .filter((s) => s.total > 0 && pct(s.used, s.total) >= 80)
        .map((s) => ({
          severity: (pct(s.used, s.total) >= 90 ? 'bad' : 'warn') as 'bad' | 'warn',
          text: f.storageHigh(s.name, pct(s.used, s.total)),
        })),
    };
  });

  const guests: Draft[] = pve.guests.map((g) => ({
    id: `guest:${g.vmid}`,
    kind: (g.kind === 'lxc' ? 'ct' : 'vm') as NodeKind,
    name: g.name || `${g.kind} ${g.vmid}`,
    subtitle: `${g.kind === 'lxc' ? 'LXC' : 'VM'} ${g.vmid} · ${g.node}`,
    // The first interface's address is the one the guest is on the wire with;
    // its own IP is not something Proxmox reports for a machine it only hosts.
    mac: g.nics?.[0]?.mac,
    status: (g.status === 'running' ? 'ok' : 'warn') as Tone,
    zone: 'Servers' as ZoneKey,
    facts: [
      { key: f.factId, value: String(g.vmid) },
      { key: f.factState, value: g.status },
      { key: f.factHost, value: g.node },
      /*
       * What the guest is actually wired to.
       *
       * The one thing about a virtual machine that decides what it can reach,
       * and the card used to say nothing about it. A guest whose config could
       * not be read says "not measured" rather than nothing, because the two
       * look identical on screen and mean opposite things.
       */
      {
        key: f.factAttached,
        value:
          g.nics === undefined || g.nics.length === 0
            ? f.notMeasured
            : g.nics.map((n) => `${n.bridge} · ${vlanLabel(n.vlan)}`).join(', '),
      },
      { key: f.factTags, value: g.tags || '—' },
    ],
    metrics: [
      {
        label: f.metricVcpu,
        value: String(g.cpuCount),
        percent: Math.min(100, g.cpuCount * 10),
      },
      {
        label: f.metricMemory,
        value: bytesLabel(g.memTotal),
        percent: Math.min(100, gib(g.memTotal) * 5),
      },
      {
        label: f.metricDisk,
        value: bytesLabel(g.diskTotal),
        percent: Math.min(100, gib(g.diskTotal) / 5),
      },
    ],
    services: [],
    warnings:
      g.status === 'running'
        ? []
        : [{ severity: 'warn' as const, text: f.guestNotRunning(g.status) }],
  }));

  const storage: Draft[] = pve.storages
    .filter((s) => s.total > 0)
    .map((s) => ({
      id: `store:${s.node}:${s.name}`,
      kind: 'storage' as NodeKind,
      name: s.name,
      subtitle: `${s.kind} · ${s.node}`,
      status: (pct(s.used, s.total) >= 90
        ? 'bad'
        : pct(s.used, s.total) >= 80
          ? 'warn'
          : 'ok') as Tone,
      zone: 'Servers' as ZoneKey,
      facts: [
        { key: f.factKind, value: s.kind },
        { key: f.factCapacity, value: bytesLabel(s.total) },
        { key: f.factFree, value: bytesLabel(s.available) },
        { key: f.factEnabled, value: s.enabled ? t.common.yes : t.common.no },
      ],
      metrics: [
        {
          label: f.metricUsage,
          value: `${bytesLabel(s.used)} / ${bytesLabel(s.total)}`,
          percent: pct(s.used, s.total),
        },
      ],
      services: [],
      warnings: [],
    }));

  return { host, bridges: bridgeNodes(pve, vlanLabel, t), guests, storage };
}

/**
 * The bridges on a hypervisor, one card each.
 *
 * A bridge is a switch — it is exactly what the word means — and until now the
 * map drew guests hanging directly off the host, which is not what they are
 * plugged into. Two facts nobody can see from the outside live here: whether
 * the bridge is VLAN-aware, and which physical port carries it. Get either
 * wrong and a guest is silently on the wrong network, or on none.
 *
 * Every bridge the node reports gets a card, including one with nothing on it:
 * an empty bridge is usually the leftover of a change that half happened, and
 * it is worth seeing.
 */
function bridgeNodes(
  pve: ProxmoxSnapshot,
  vlanLabel: (vlan: number | null) => string,
  t: Dict,
): Draft[] {
  const f = t.findings;

  return pve.interfaces
    .filter((i) => i.kind.includes('bridge'))
    .map<Draft>((iface) => {
      const on = pve.guests.filter(
        (g) => g.node === iface.node && (g.nics ?? []).some((n) => n.bridge === iface.name),
      );
      // Which VLANs actually arrive here, as measured on the guests rather
      // than as configured on the bridge: the bridge itself does not say.
      const vlans = [
        ...new Set(
          on.flatMap((g) =>
            (g.nics ?? []).filter((n) => n.bridge === iface.name).map((n) => n.vlan),
          ),
        ),
      ].sort((a, b) => (a ?? 0) - (b ?? 0));

      return {
        id: `bridge:${iface.node}:${iface.name}`,
        kind: 'bridge' as NodeKind,
        name: iface.name,
        subtitle: `${iface.node}${iface.bridgePorts ? ` · ${iface.bridgePorts}` : ''}`,
        ip: iface.address ?? undefined,
        status: (iface.active ? 'ok' : 'idle') as Tone,
        zone: 'Servers' as ZoneKey,
        facts: [
          { key: f.factHost, value: iface.node },
          { key: f.factUplinkPort, value: iface.bridgePorts || '—' },
          {
            key: f.factVlanAware,
            value: iface.vlanAware ? t.common.yes : t.common.no,
          },
          { key: f.factAddress, value: iface.cidr || iface.address || '—' },
          {
            key: f.factCarries,
            value: vlans.length > 0 ? vlans.map(vlanLabel).join(', ') : '—',
          },
        ],
        metrics: [
          {
            label: f.metricGuests,
            value: String(on.length),
            percent: Math.min(100, on.length * 10),
          },
        ],
        services: [],
        warnings: [
          ...(iface.active
            ? []
            : [
                {
                  severity: 'warn' as const,
                  text: f.bridgeInactive(iface.name),
                },
              ]),
          /*
           * A tagged guest on a bridge that does not know about VLANs.
           *
           * The tag is then simply not applied: the guest lands on the bridge's
           * own network with no error anywhere, which is the failure that takes
           * an afternoon to find. Only claimed where both halves were measured.
           */
          ...(!iface.vlanAware && vlans.some((v) => v != null)
            ? [
                {
                  severity: 'bad' as const,
                  text: f.bridgeTagWithoutVlanAware(iface.name),
                },
              ]
            : []),
        ],
      };
    });
}

/**
 * Which machines the controller learned on which port, by name.
 *
 * The controller reports every wired client with the switch and port it was
 * learned on. That is the third measured source for what is on a port, and the
 * only one that reaches equipment the controller does not manage: a Proxmox
 * host is not a UniFi device, so it has no uplink report, and a stock install
 * does not run `lldpd`, so the port shows up at a speed with nobody's name on
 * it. The controller knew all along.
 *
 * Where a client's address matches a surveyed Proxmox node, the estate's own
 * name for that node is used rather than the DHCP hostname — the two are often
 * different, and the map should say what the rest of the interface says.
 *
 * Keyed `switchMac#portIndex`.
 */
/**
 * Which Proxmox node a wired client is, where it can be told at all.
 *
 * Two ways, and the difference between them matters enough to report:
 *
 *   By address. An address the node's own interface list carries is the node,
 *   full stop. Measured on both sides.
 *
 *   By name. The controller reports the DHCP hostname it was given, and for a
 *   hypervisor that is almost always the node's own name — but "almost always"
 *   is an inference, and it is marked as one.
 *
 * The second is not a nicety. A node with several addresses, or one the
 * controller learned on a different network than the one its interface list
 * names, matches on neither address nor anything else — and then the estate
 * draws its hypervisor as an unnamed client hanging off a switch, with a
 * guessed line to the gateway beside it. Which is exactly what it did.
 */
function nodeOfClient(
  c: UnifiClient,
  pve: ProxmoxSnapshot | null,
): { node: string; measured: boolean } | null {
  if (!pve) return null;

  for (const node of pve.nodes) {
    for (const iface of pve.interfaces) {
      if (iface.node !== node.name) continue;
      const address = iface.address ?? iface.cidr?.split('/')[0];
      if (address && address === c.ip) return { node: node.name, measured: true };
    }
  }

  // The first label of the hostname: the controller reports "pve" where the
  // cluster calls the node "pve", and "pve.lan" where the DHCP server adds a
  // domain to it.
  const reported = c.hostname.split('.')[0]?.toLowerCase() ?? '';
  if (!reported) return null;
  const named = pve.nodes.find((n) => n.name.toLowerCase() === reported);
  return named ? { node: named.name, measured: false } : null;
}

function fromWiredClients(unifi: UnifiSnapshot, pve: ProxmoxSnapshot | null): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of unifi.clients) {
    if (!c.wired || !c.switchMac || c.switchPort <= 0) continue;
    // The estate's own name for a node it recognises, rather than whatever the
    // DHCP server was told: the two are often different, and the map should
    // say what the rest of the interface says.
    const name = nodeOfClient(c, pve)?.node || c.hostname || c.ip;
    if (!name) continue;
    out.set(`${c.switchMac.toLowerCase()}#${c.switchPort}`, name);
  }
  return out;
}

function unifiNodes(
  unifi: UnifiSnapshot,
  pve: ProxmoxSnapshot | null,
  t: Dict,
): {
  wan: Draft[];
  gateways: Draft[];
  switches: Draft[];
  aps: Draft[];
  clients: Draft[];
} {
  const f = t.findings;
  // The controller reports a neighbour's MAC; the estate knows it by name.
  const nameByMac = new Map(unifi.devices.map((d) => [d.mac.toLowerCase(), d.name || d.model]));

  /*
   * Ports whose far end is known from an uplink report rather than from LLDP.
   *
   * A device states which port of its parent it hangs off, and which of its
   * own carries the link. That is measured, not inferred — and it is often the
   * only source, because a lot of hardware never announces itself. Without it
   * a real cable shows up as a line with no port number on either end, which
   * is the one thing the port view exists to answer.
   *
   * Keyed `deviceMac#portIndex`.
   */
  const onPort = fromWiredClients(unifi, pve);

  /*
   * What the controller has configured on a port, and who is on the far end.
   *
   * The port list answered "what is plugged in" and stopped there. The other
   * half — which profile the port carries, which network that profile leaves
   * untagged, and the far end's own address — is measured just as plainly, and
   * is what someone is looking for when a machine has come up on the wrong
   * network or when two identical boxes have to be told apart.
   */
  const deviceByMac = new Map(unifi.devices.map((d) => [d.mac.toLowerCase(), d]));
  const profileById = new Map(unifi.portProfiles.map((x) => [x.id, x]));
  const networkById = new Map(unifi.networks.map((n) => [n.id, n]));
  const clientOnPort = new Map<string, (typeof unifi.clients)[number]>();
  for (const c of unifi.clients) {
    if (!c.wired || !c.switchMac || c.switchPort <= 0) continue;
    const key = `${c.switchMac.toLowerCase()}#${c.switchPort}`;
    if (!clientOnPort.has(key)) clientOnPort.set(key, c);
  }

  const fromUplink = new Map<string, string>();
  for (const d of unifi.devices) {
    if (!d.uplinkMac) continue;
    const parent = nameByMac.get(d.uplinkMac.toLowerCase());
    const child = d.name || d.model || d.mac;
    if (d.uplinkLocalPort > 0 && parent) {
      fromUplink.set(`${d.mac.toLowerCase()}#${d.uplinkLocalPort}`, parent);
    }
    if (d.uplinkRemotePort > 0) {
      fromUplink.set(`${d.uplinkMac.toLowerCase()}#${d.uplinkRemotePort}`, child);
    }
  }

  const drafts = unifi.devices.map<Draft>((d) => {
    const kind = deviceKind(d.kind);
    return {
      id: `unifi:${d.mac}`,
      kind,
      name: d.name || d.model || d.mac,
      subtitle: `${d.ip || '—'} · ${d.model}`,
      // Looked up rather than read: the far end of a cable, a row in a port
      // list, one of two identical boxes.
      ip: d.ip,
      mac: d.mac,
      status: deviceStatus(d),
      zone: zoneOf(kind),
      ports: d.ports.map((p) => {
        const key = `${d.mac.toLowerCase()}#${p.idx}`;
        const profile = p.portConfId ? profileById.get(p.portConfId) : undefined;
        const native = profile?.nativeNetworkId
          ? networkById.get(profile.nativeNetworkId)
          : undefined;
        const client = clientOnPort.get(key);
        const lldp = p.neighbourMac ? deviceByMac.get(p.neighbourMac.toLowerCase()) : undefined;

        return {
          idx: p.idx,
          name: p.name,
          up: p.up,
          enabled: p.enabled,
          speed: p.speed,
          poe: p.poeEnabled,
          poePower: p.poePower,
          vlanMode: p.taggedVlanMgmt,
          profile: profile?.name ?? '',
          forward: profile?.forward ?? '',
          // The untagged network as the controller has it. A network with no
          // VLAN id is the default LAN, which has a name but no number — both
          // are carried so neither has to be guessed from the other.
          nativeVlan: native?.vlan ?? 0,
          nativeNetwork: native?.name ?? '',
          // Prefer the estate's own name for a known device over the neighbour's
          // self-reported one, then what LLDP said, then the uplink report.
          // Three measured sources, strongest first: what the far end announced
          // over LLDP, what a UniFi device said about its own uplink, and what
          // the controller learned on the port. The last is the only one that
          // reaches a machine the controller does not manage.
          neighbour:
            nameByMac.get(p.neighbourMac.toLowerCase()) ??
            (p.neighbourName ||
              fromUplink.get(`${d.mac.toLowerCase()}#${p.idx}`) ||
              onPort.get(`${d.mac.toLowerCase()}#${p.idx}`) ||
              ''),
          neighbourPort: p.neighbourPort,
          // The far end's own addresses, from whichever source saw it: LLDP
          // names a MAC the controller may also manage, and a wired client
          // reports both of its own.
          neighbourMac: p.neighbourMac || lldp?.mac || client?.mac || '',
          neighbourIp: lldp?.ip || client?.ip || '',
          uplink: p.isUplink,
        };
      }),
      facts: [
        { key: f.factModel, value: d.model || '—' },
        { key: f.factFirmware, value: d.version || '—' },
        {
          key: f.factUptime,
          value: d.state === 1 ? uptimeLabel(d.uptimeSecs, t) : f.offline,
        },
        { key: f.factMac, value: d.mac },
      ],
      metrics:
        d.state === 1
          ? [
              {
                label: f.metricClients,
                value: String(d.clients),
                percent: Math.min(100, d.clients * 2),
              },
            ]
          : [{ label: f.metricAvailability, value: 'Offline', percent: 0 }],
      services: [],
      warnings:
        d.state === 1
          ? []
          : [
              {
                severity: 'bad' as const,
                text: f.deviceOffline,
              },
            ],
    };
  });

  const gateways = drafts.filter((d) => d.kind === 'gateway');
  const switches = drafts.filter((d) => d.kind === 'switch');
  const aps = drafts.filter((d) => d.kind === 'ap');

  return {
    wan: wanNodes(unifi, t),
    gateways,
    switches,
    aps,
    clients: clientNodes(unifi, pve, t),
  };
}

/** How many machines a client card names before it starts counting instead. */
const NAMED_CLIENTS = 12;

/**
 * The clients, grouped by the device that reports them.
 *
 * One bubble for the whole estate was the easy answer and the wrong one: the
 * controller says which access point each wireless client is associated with
 * and which switch port each wired one was learned on, and collapsing all of
 * that into a single card threw away the one thing somebody looking at a map
 * wants to know — where the machines actually are. It also drew every access
 * point's cable to the same spot, which is what made the lower half of the map
 * a fan of crossing lines.
 *
 * So: one card per device that has clients, named machines listed on it, and
 * the ones the controller could not place kept apart in a card of their own
 * rather than quietly folded in with the rest.
 */
function clientNodes(unifi: UnifiSnapshot, pve: ProxmoxSnapshot | null, t: Dict): Draft[] {
  const f = t.findings;

  // Machines that are cards of their own are not clients of anything here: the
  // UniFi devices themselves, and the hypervisor, which has its own cable.
  const deviceMacs = new Set(unifi.devices.map((d) => d.mac.toLowerCase()));

  /*
   * The machines that live behind a hypervisor, not on the switch.
   *
   * A guest on a bridge has its own address on the wire, so the controller
   * learns it on whatever port the *host* is plugged into and reports it as a
   * client of that switch. Drawn as one, it hangs off the switch — a path that
   * goes round the machine it actually runs on, which is not how any of it is
   * wired. The guest is already on the map, on its bridge, on its host.
   *
   * Two ways to know, and the first is exact: the address the guest's own
   * configuration gives its interface. The second catches the guests whose
   * configuration could not be read — anything learned on the very port the
   * host is on is behind that host, because that is what the port carries.
   */
  const guestMacs = new Set(
    (pve?.guests ?? []).flatMap((g) => (g.nics ?? []).map((n) => n.mac.toLowerCase())),
  );
  const hostPorts = new Set(
    unifi.clients
      .filter((c) => c.wired && c.switchMac && c.switchPort > 0 && nodeOfClient(c, pve))
      .map((c) => `${c.switchMac.toLowerCase()}#${c.switchPort}`),
  );

  const byDevice = new Map<string, typeof unifi.clients>();
  const unplaced: typeof unifi.clients = [];

  for (const c of unifi.clients) {
    // A card of its own is not a client of anything: the UniFi devices, and
    // any Proxmox node the controller happens to have learned.
    if (deviceMacs.has(c.mac.toLowerCase()) || nodeOfClient(c, pve)) continue;
    if (guestMacs.has(c.mac.toLowerCase())) continue;
    if (c.wired && c.switchMac && hostPorts.has(`${c.switchMac.toLowerCase()}#${c.switchPort}`)) {
      continue;
    }
    const anchor = (c.wired ? c.switchMac : c.apMac).toLowerCase();
    if (anchor && deviceMacs.has(anchor)) {
      const group = byDevice.get(anchor);
      if (group) group.push(c);
      else byDevice.set(anchor, [c]);
    } else {
      unplaced.push(c);
    }
  }

  const nameOf = (c: (typeof unifi.clients)[number]) => c.hostname || c.ip || c.oui || c.mac;

  const draft = (id: string, name: string, group: typeof unifi.clients, on: string): Draft => {
    const wireless = group.filter((c) => !c.wired).length;
    const unknown = group.filter((c) => !c.oui).length;
    const named = group.slice(0, NAMED_CLIENTS);

    return {
      id,
      kind: 'clients' as NodeKind,
      name,
      subtitle: f.clientsSubtitle(wireless, group.length - wireless),
      status: (unknown > 0 ? 'idle' : 'ok') as Tone,
      zone: 'IoT' as ZoneKey,
      facts: [
        { key: f.factOn, value: on },
        { key: f.factTotal, value: String(group.length) },
        { key: f.factWireless, value: String(wireless) },
        { key: f.factWired, value: String(group.length - wireless) },
        { key: f.factUnidentified, value: String(unknown) },
      ],
      metrics: [
        {
          label: f.factWireless,
          value: String(wireless),
          percent: pct(wireless, group.length),
        },
      ],
      /*
       * The machines by name, because that is the question the card exists to
       * answer. Capped, and the cap says how many it is not showing rather
       * than letting the list run down the inspector.
       */
      services: [
        ...named.map((c) => ({
          name: nameOf(c),
          detail: [c.ip, c.wired ? f.factWired : f.factWireless, c.oui].filter(Boolean).join(' · '),
          status: (c.oui ? 'ok' : 'idle') as Tone,
          provenance: 'Felmért' as const,
        })),
        ...(group.length > named.length
          ? [
              {
                name: f.clientsMore(group.length - named.length),
                detail: '',
                status: 'idle' as Tone,
                provenance: 'Felmért' as const,
              },
            ]
          : []),
      ],
      warnings: unknown > 0 ? [{ severity: 'warn' as const, text: f.unknownVendor(unknown) }] : [],
    };
  };

  const out: Draft[] = [];
  for (const [mac, group] of byDevice) {
    const device = unifi.devices.find((d) => d.mac.toLowerCase() === mac);
    const on = device?.name || device?.model || mac;
    out.push(draft(`clients:${mac}`, f.clientsNode(group.length), group, on));
  }
  if (unplaced.length > 0) {
    out.push(draft('clients', f.clientsUnplaced(unplaced.length), unplaced, f.notMeasured));
  }
  return out;
}

/**
 * The id of a WAN card.
 *
 * One helper for the card and for its cable, because they used to build the
 * same string in two places and one of them fell back to the list index while
 * the other fell back to an empty string — so a link the controller reported
 * without an interface name got a card with no cable to it.
 */
function wanId(w: UnifiWan, index: number): string {
  return `wan:${w.ifname || w.name || index}`;
}

/**
 * The way out, one card per link.
 *
 * One card each rather than a single "Internet", because a second WAN is a
 * different provider on a different wire, and the whole reason to draw it is
 * to see which of the two is carrying the estate and which one is dark.
 *
 * Nothing here is inferred. A figure the survey did not measure comes back as
 * -1 and is shown as not measured, which is the honest reading: a link nobody
 * has speed-tested is not a slow link.
 */
function wanNodes(unifi: UnifiSnapshot, t: Dict): Draft[] {
  const f = t.findings;

  return (unifi.wans ?? []).map<Draft>((w, i) => {
    const speedtest =
      w.xputDown >= 0
        ? f.speedtestResult(Math.round(w.xputDown), Math.round(Math.max(0, w.xputUp)))
        : f.notMeasured;

    return {
      id: wanId(w, i),
      kind: 'cloud' as NodeKind,
      name: w.isp || f.internet,
      subtitle: `${w.ip || '—'}${w.kind ? ` · ${w.kind.toUpperCase()}` : ''}`,
      ip: w.ip,
      status: (w.up ? 'ok' : 'bad') as Tone,
      zone: 'WAN' as ZoneKey,
      facts: [
        { key: f.factLink, value: w.name || 'WAN' },
        { key: f.factIsp, value: w.isp || f.notMeasured },
        { key: f.factWanGateway, value: w.gatewayIp || '—' },
        {
          key: f.factDns,
          value: w.nameservers.length > 0 ? w.nameservers.join(', ') : '—',
        },
        {
          key: f.factUptime,
          value: w.up ? uptimeLabel(w.uptimeSecs, t) : f.offline,
        },
        { key: f.factSpeedtest, value: speedtest },
      ],
      metrics: [
        // Latency is drawn against 100 ms, which is where a household link
        // stops feeling immediate. The bar is a reading, not a verdict.
        {
          label: f.metricLatency,
          value: w.latencyMs >= 0 ? f.milliseconds(w.latencyMs) : f.notMeasured,
          percent: w.latencyMs >= 0 ? Math.min(100, w.latencyMs) : 0,
        },
        ...(w.speed > 0
          ? [
              {
                label: f.metricPortSpeed,
                value: f.megabits(w.speed),
                percent: Math.min(100, Math.round((w.speed / 1000) * 100)),
              },
            ]
          : []),
      ],
      services: [],
      warnings: w.up ? [] : [{ severity: 'bad' as const, text: f.wanDown(w.name || 'WAN') }],
    };
  });
}

/* ------------------------------------------------------------------- links */

function buildLinks(
  unifi: UnifiSnapshot | null,
  pve: ProxmoxSnapshot | null,
  // Positions are deliberately absent: the links are worked out before
  // anything is placed, so the layout can use them to decide where each node
  // goes. Everything else about a node is still available.
  nodes: Draft[],
): NetLink[] {
  const links: NetLink[] = [];
  const present = new Set(nodes.map((n) => n.id));
  // One cable, one line. The same pair can be measured twice — a device
  // reports its uplink and LLDP sees the same link from the other end — and
  // two strokes between two cards read as two cables.
  const drawn = new Set<string>();
  const add = (link: NetLink) => {
    if (!present.has(link.from) || !present.has(link.to)) return;
    const pair = [link.from, link.to].sort().join('|');
    if (drawn.has(pair)) return;
    drawn.add(pair);
    links.push(link);
  };

  if (unifi) {
    // Uplink chains are reported by the devices themselves: measured.
    for (const d of unifi.devices) {
      if (!d.uplinkMac) continue;
      add({
        from: `unifi:${d.uplinkMac}`,
        to: `unifi:${d.mac}`,
        kind: d.state === 1 ? 'physical' : 'broken',
        direction: d.state === 1 ? 'both' : 'none',
      });
    }

    /*
     * Cables LLDP saw that no uplink report mentions.
     *
     * A device only reports an uplink while it is adopted and talking; one
     * that dropped off, or a third-party box the controller never adopted,
     * says nothing at all. Its parent's port table still names it, because
     * LLDP is answered by the far end and the near end recorded it. That is
     * measured evidence of a cable between two cards that are both on the map,
     * and it used to be thrown away.
     */
    const byMac = new Map(unifi.devices.map((d) => [d.mac.toLowerCase(), d]));
    for (const d of unifi.devices) {
      for (const p of d.ports) {
        if (!p.neighbourMac) continue;
        const far = byMac.get(p.neighbourMac.toLowerCase());
        if (!far || far.mac === d.mac) continue;
        add({
          from: `unifi:${d.mac}`,
          to: `unifi:${far.mac}`,
          kind: p.up ? 'physical' : 'broken',
          direction: p.up ? 'both' : 'none',
        });
      }
    }

    /*
     * The way out.
     *
     * The gateway reports the WAN as its own interface, so the line between
     * the two is measured in the same sense as any uplink. Where the health
     * summary was the only source, no gateway is attributed and the card sits
     * on its own rather than being wired to a guess.
     */
    const gateways = nodes.filter((n) => n.kind === 'gateway');
    (unifi.wans ?? []).forEach((w, i) => {
      const carried = (target: string, provenance?: Provenance) =>
        add({
          from: wanId(w, i),
          to: target,
          kind: w.up ? 'physical' : 'broken',
          direction: w.up ? 'both' : 'none',
          ...(provenance ? { provenance } : {}),
        });

      // The gateway named itself: measured, like any uplink report.
      if (w.deviceMac) {
        carried(`unifi:${w.deviceMac}`);
        return;
      }

      /*
       * The controller's health summary knows there is a way out and does not
       * say which gateway carries it. Leaving the card unattached was worse
       * than saying so: a card floating beside a gateway that plainly holds
       * that very address reads as a fault in the map.
       *
       * Two things can attribute it, and both are conclusions rather than
       * measurements, so the line is marked inferred either way:
       *
       *   The address. A gateway reports its WAN address as its own, so a
       *   device holding exactly this address is the one carrying the link.
       *
       *   Being the only one. A site with a single gateway has nowhere else
       *   for a WAN to arrive; a site with two is not guessed at, and the card
       *   stays on its own rather than pointing at whichever came first.
       */
      const holder = w.ip
        ? unifi.devices.find((d) => d.ip && d.ip === w.ip && deviceKind(d.kind) === 'gateway')
        : undefined;
      const target = holder
        ? nodes.find((n) => n.id === `unifi:${holder.mac}`)
        : gateways.length === 1
          ? gateways[0]
          : undefined;

      if (target) carried(target.id, 'Becsült');
    });

    /*
     * Each client card to the device that reports it.
     *
     * Measured per client — the controller names the access point or the
     * switch port — and shown as one line per device, so the line itself is an
     * inference about the group rather than about any one machine.
     */
    for (const card of nodes.filter((n) => n.kind === 'clients' && n.id.startsWith('clients:'))) {
      const mac = card.id.slice('clients:'.length);
      const device = unifi.devices.find((d) => d.mac.toLowerCase() === mac);
      if (!device) continue;
      const wired = unifi.clients.some((c) => c.wired && c.switchMac.toLowerCase() === mac);
      add({
        from: `unifi:${device.mac}`,
        to: card.id,
        kind: wired ? 'physical' : 'wireless',
        direction: 'both',
        provenance: 'Becsült',
      });
    }

    /*
     * The ones the controller could not place. They are somewhere behind the
     * gateway and nothing measured says more than that, so the line says the
     * same: logical, and marked inferred.
     */
    const unplaced = nodes.find((n) => n.id === 'clients');
    const gateway = nodes.find((n) => n.kind === 'gateway');
    if (unplaced && gateway) {
      add({
        from: gateway.id,
        to: unplaced.id,
        kind: 'logical',
        direction: 'both',
        provenance: 'Becsült',
      });
    }
  }

  if (pve) {
    /*
     * Host → bridge → guest, where the guest says which bridge.
     *
     * A guest is not plugged into its hypervisor, it is plugged into a bridge
     * on it, and that bridge is what decides which VLAN the guest lands in.
     * Where the config was readable the map now says so; where it was not, the
     * old direct line to the host stands — which is honest about knowing that
     * the guest runs there and nothing more.
     */
    const bridges = new Set(
      pve.interfaces.filter((i) => i.kind.includes('bridge')).map((i) => `${i.node}:${i.name}`),
    );
    for (const key of bridges) {
      const node = key.slice(0, key.indexOf(':'));
      add({
        from: `pve:${node}`,
        to: `bridge:${key}`,
        kind: 'physical',
        direction: 'both',
      });
    }

    for (const node of pve.nodes) {
      for (const g of pve.guests.filter((x) => x.node === node.name)) {
        const attached = (g.nics ?? [])
          .filter((n) => bridges.has(`${node.name}:${n.bridge}`))
          .map((n) => `bridge:${node.name}:${n.bridge}`);

        for (const from of attached.length > 0 ? attached : [`pve:${node.name}`]) {
          add({
            from,
            to: `guest:${g.vmid}`,
            kind: g.status === 'running' ? 'physical' : 'broken',
            direction: g.status === 'running' ? 'both' : 'none',
          });
        }
      }
      for (const s of pve.storages.filter((x) => x.node === node.name && x.total > 0)) {
        add({
          from: `pve:${node.name}`,
          to: `store:${node.name}:${s.name}`,
          kind: 'physical',
          direction: 'both',
        });
      }
    }
  }

  /*
   * The hypervisor's path into the network.
   *
   * Where the controller learned the host's address on a port, that is a
   * measured cable to a named switch on a numbered port, and it is drawn as
   * one. Where it did not — the host is on a plain switch, or the controller
   * has not seen its traffic — nothing read-only can prove which box it hangs
   * off, so the old behaviour stands: a logical line to the gateway, labelled
   * as inferred. The difference between the two is the difference between
   * knowing and assuming, and the map now shows which it has.
   */
  if (unifi && pve) {
    const gateway = nodes.find((n) => n.kind === 'gateway');

    /*
     * Every node, not the first one.
     *
     * A cluster is three hosts, and only one of them used to get a line — the
     * other two floated on the map with no path into the network, which is the
     * one thing a topology must not say about a machine that is plainly
     * reachable. Each node is matched against its *own* interfaces, too: any
     * address on any host used to satisfy the search, so in a cluster the
     * cable could be drawn to the wrong box.
     */
    for (const host of nodes.filter((n) => n.kind === 'host')) {
      const name = host.id.slice('pve:'.length);

      // A host with two NICs into two switches has two cables, and the
      // controller learned it on both. Drawing one of them would make a
      // redundant path look like a single point of failure.
      const learned = unifi.clients
        .map((c) => ({ c, match: nodeOfClient(c, pve) }))
        .filter(
          ({ c, match }) => c.wired && c.switchMac && c.switchPort > 0 && match?.node === name,
        );
      const switches = learned
        .map(({ c, match }) => ({
          card: nodes.find((n) => n.id.toLowerCase() === `unifi:${c.switchMac}`.toLowerCase()),
          measured: match?.measured ?? false,
        }))
        .filter((s): s is { card: Draft; measured: boolean } => s.card !== undefined);

      if (switches.length > 0) {
        for (const { card, measured } of switches) {
          // The cable is measured either way — the controller learned a machine
          // on that port. Whether that machine is *this* host is what the name
          // match only makes likely, so that is what the marking is about.
          add({
            from: card.id,
            to: host.id,
            kind: 'physical',
            direction: 'both',
            ...(measured ? {} : { provenance: 'Becsült' as Provenance }),
          });
        }
      } else if (gateway) {
        add({
          from: gateway.id,
          to: host.id,
          kind: 'logical',
          direction: 'both',
          provenance: 'Becsült',
        });
      }
    }
  }

  return links;
}

/* ------------------------------------------------------------------ policy */

function buildZones(unifi: UnifiSnapshot, live: LiveEstate, t: Dict): Zone[] {
  const nets = unifi.networks.filter((n) => n.enabled);

  return nets.map((n) => {
    const ssids = unifi.wlans.filter((w) => w.networkId === n.id).map((w) => w.name);
    const clients = unifi.clients.filter((c) =>
      n.vlan != null ? c.vlan === n.vlan : c.network === n.name,
    ).length;

    /*
     * Isolation is a claim about traffic, so it is only made where traffic was
     * decided by a ruleset we read. Where the gateway's own bridge for this
     * network never appeared, the zone stays unmeasured — a network the loaded
     * ruleset never mentions is not thereby open, and not thereby closed.
     */
    const verdicts = nets
      .filter((other) => other !== n)
      .map((other) => combinedReachability(live, n.vlan, other.vlan)?.verdict)
      .filter((v): v is LiveVerdict => v !== undefined);

    if (verdicts.length === 0) {
      return {
        vlan: n.vlan != null ? String(n.vlan) : '—',
        name: n.name,
        net: n.subnet || '—',
        ssid: ssids.length > 0 ? ssids.join(', ') : '—',
        devices: clients,
        isolation: t.findings.notMeasured,
        state: 'Nem ellenőrzött' as const,
      };
    }

    const open = verdicts.filter((v) => v === 'allow').length;
    const shut = verdicts.filter((v) => v === 'block').length;

    return {
      vlan: n.vlan != null ? String(n.vlan) : '—',
      name: n.name,
      net: n.subnet || '—',
      ssid: ssids.length > 0 ? ssids.join(', ') : '—',
      devices: clients,
      isolation:
        shut === verdicts.length
          ? t.policy.isolatedFully
          : open === verdicts.length
            ? t.policy.isolatedNone
            : t.policy.isolatedPartly,
      state: 'Felmért' as const,
    };
  });
}

function buildRules(
  unifi: UnifiSnapshot,
  live: LiveFirewall,
  checkedAt: string,
  t: Dict,
): FirewallRule[] {
  const nameById = new Map(unifi.networks.map((n) => [n.id, n.name]));
  const resolve = (id: string) => (id ? (nameById.get(id) ?? id) : t.findings.anyTarget);

  return unifi.firewallRules
    .filter((r) => r.enabled)
    .sort((a, b) => a.index - b.index)
    .map((r) => {
      /*
       * Found in the loaded ruleset, so this rule is not merely configured.
       *
       * Not finding it proves nothing and is treated that way: the gateway
       * names a rule's id only on the log line that accompanies it, logging is
       * per-rule, and a rule with logging switched off leaves no id behind.
       * Absence here is ignorance, so the state stays what it was.
       */
      const loaded = r.id !== '' && live.ruleIds.has(r.id);

      return {
        src: resolve(r.src),
        dst: resolve(r.dst),
        port: r.dstPort ? `${r.protocol || 'any'} ${r.dstPort}` : r.protocol || t.findings.anyPort,
        action: (r.action === 'drop' || r.action === 'reject' ? 'Tilt' : 'Engedélyez') as
          'Tilt' | 'Engedélyez',
        state: loaded ? ('Felmért' as const) : ('Nem ellenőrzött' as const),
        checkedAt: loaded ? checkedAt : '—',
      };
    });
}

/* ---------------------------------------------------------------- findings */

function buildSignals(
  unifi: UnifiSnapshot | null,
  pve: ProxmoxSnapshot | null,
  leaks: { from: string; to: string }[],
  t: Dict,
): SecuritySignal[] {
  const f = t.findings;
  const out: SecuritySignal[] = [];

  /*
   * Listed first, and as a fault rather than a note, because it is a separation
   * the estate believes it has. Both rulesets were read and both were measured,
   * so this is not a suspicion — the traffic IPv4 stops has a way through.
   */
  for (const { from, to } of leaks.slice(0, 6)) {
    out.push({
      severity: 'bad',
      title: f.signalV6Leak(from, to),
      text: f.signalV6LeakText,
      zone: from,
    });
  }

  if (unifi) {
    for (const d of unifi.devices.filter((x) => x.state !== 1)) {
      out.push({
        severity: 'bad',
        title: f.signalOffline(d.name || d.mac),
        text: f.signalOfflineText,
        zone: d.ip || t.common.unknown,
      });
    }

    const guestWlans = unifi.wlans.filter((w) => w.isGuest && w.enabled);
    if (guestWlans.length === 0 && unifi.wlans.length > 0) {
      out.push({
        severity: 'warn',
        title: f.signalNoGuestSsid,
        text: f.signalNoGuestSsidText,
        zone: 'Wi-Fi',
      });
    }

    for (const w of unifi.wlans.filter((x) => x.enabled && /^(open|wep)$/i.test(x.security))) {
      out.push({
        severity: 'bad',
        title: f.signalWeakWifi(w.name),
        text: f.signalWeakWifiText(w.security),
        zone: 'Wi-Fi',
      });
    }

    if (unifi.firewallRules.length > 0) {
      out.push({
        severity: 'info',
        title: f.signalRulesRead(unifi.firewallRules.length),
        text: f.signalRulesReadText,
        zone: 'Policy',
      });
    }
  }

  if (pve) {
    for (const s of pve.storages.filter((x) => x.total > 0 && pct(x.used, x.total) >= 85)) {
      out.push({
        severity: pct(s.used, s.total) >= 90 ? 'bad' : 'warn',
        title: f.signalStorage(s.name, pct(s.used, s.total)),
        text: f.signalStorageText,
        zone: s.node,
      });
    }

    const nonVlanBridges = pve.interfaces.filter((i) => i.kind === 'bridge' && !i.vlanAware);
    if (nonVlanBridges.length > 0) {
      out.push({
        severity: 'info',
        title: f.signalNonVlanBridge,
        text: f.signalNonVlanBridgeText(nonVlanBridges.map((i) => i.name).join(', ')),
        zone: 'Proxmox',
      });
    }
  }

  return out;
}

function buildRisks(unifi: UnifiSnapshot | null, pve: ProxmoxSnapshot | null, t: Dict): Risk[] {
  const f = t.findings;
  const out: Risk[] = [];

  if (pve) {
    for (const s of pve.storages.filter((x) => x.total > 0 && pct(x.used, x.total) >= 80)) {
      out.push({
        severity: pct(s.used, s.total) >= 90 ? 'bad' : 'warn',
        title: f.signalStorage(s.name, pct(s.used, s.total)),
        where: `${s.node} · ${s.kind}`,
        text: f.riskStorageFree(bytesLabel(s.available)),
      });
    }
    for (const g of pve.guests.filter((x) => x.status !== 'running')) {
      out.push({
        severity: 'warn',
        title: f.riskGuestStopped(g.name || String(g.vmid)),
        where: `${g.node} · ${g.kind === 'lxc' ? 'LXC' : 'VM'} ${g.vmid}`,
        text: f.riskGuestStoppedText(g.status),
      });
    }
    for (const d of pve.disks.filter(
      (x) => x.health && x.health !== 'PASSED' && x.health !== 'OK',
    )) {
      out.push({
        severity: 'bad',
        title: f.riskDisk(d.model || d.devpath),
        where: `${d.node} · ${d.serial || d.devpath}`,
        text: f.riskDiskText(d.health),
      });
    }
  }

  if (unifi) {
    for (const d of unifi.devices.filter((x) => x.state !== 1)) {
      out.push({
        severity: 'bad',
        title: f.riskDeviceOffline(d.name || d.mac),
        where: d.ip || d.mac,
        text: f.riskDeviceOfflineText,
      });
    }
    const unknown = unifi.clients.filter((c) => !c.oui).length;
    if (unknown > 0) {
      out.push({
        severity: 'warn',
        title: f.riskUnknownClients(unknown),
        where: `site: ${unifi.site}`,
        text: f.riskUnknownClientsText,
      });
    }
  }

  return out;
}

/* ------------------------------------------------------------------ public */

export function estateFromSnapshot(snapshot: SurveySnapshot, profiles: Profile[], t: Dict): Estate {
  const f = t.findings;
  const { proxmox: pve, unifi } = snapshot;

  const uni = unifi
    ? unifiNodes(unifi, pve, t)
    : { wan: [], gateways: [], switches: [], aps: [], clients: [] };
  const vlanNames = new Map<number, string>(
    (unifi?.networks ?? [])
      .filter((n) => n.vlan != null)
      .map((n) => [n.vlan as number, n.name] as [number, string]),
  );
  const prox = pve
    ? proxmoxNodes(pve, vlanNames, t)
    : { host: [], bridges: [], guests: [], storage: [] };

  const tiers = [
    uni.wan,
    uni.gateways,
    [...uni.switches, ...prox.host, ...prox.storage],
    [...uni.aps, ...prox.bridges],
    [...uni.clients, ...prox.guests],
  ];

  // Links first: they depend only on ids, and the layout needs them to put
  // each device under whatever it hangs off.
  const links = buildLinks(unifi, pve, tiers.flat());
  const nodes = placeTiers(orderTiers(tiers, links), links);
  /*
   * The ruleset the gateway actually holds, where a survey could read it.
   *
   * Parsed once and threaded through, because the zone table, the matrix and
   * the rule list all answer the same question — is this in force? — and they
   * must not be able to disagree.
   */
  const live = readLiveEstate(
    unifi?.liveFirewall ?? '',
    unifi?.liveFirewallV6 ?? '',
    unifi?.liveAddresses ?? '',
  );
  const nets = unifi ? unifi.networks.filter((n) => n.enabled) : [];
  const zones = unifi ? buildZones(unifi, live, t) : [];

  const counts: Record<Tone, number> = { ok: 0, warn: 0, bad: 0, idle: 0 };
  for (const n of nodes) counts[n.status] += 1;

  /*
   * Zone-to-zone reachability, decided by the loaded ruleset where one was
   * read and left unverified where none was.
   *
   * Reading configuration can never establish these — that was the whole of
   * this table until the gateway itself could be asked — so a cell only stops
   * being unverified when a chain in the loaded ruleset decides it. The
   * diagonal is a network to itself, which never crosses the firewall.
   */
  const combined = nets.map((from, i) =>
    nets.map((to, j) => (i === j ? null : combinedReachability(live, from.vlan, to.vlan))),
  );

  const matrix: MatrixCell[][] = combined.map((row, i) =>
    row.map((pair, j) => {
      if (i === j) return 'a';
      if (!pair) return 'u';
      return pair.verdict === 'allow' ? 'a' : pair.verdict === 'block' ? 'b' : 'l';
    }),
  );

  const unverifiedCells = matrix.flat().filter((c) => c === 'u').length;

  /*
   * Pairs IPv4 separates and IPv6 does not.
   *
   * Worth naming rather than leaving as a colour, because it is the one thing
   * here that contradicts what the controller's own interface will tell you:
   * the rule is configured, it is loaded, it works — and the traffic gets
   * through anyway over the family the rule does not cover.
   */
  const leaks = combined.flatMap((row, i) =>
    row.flatMap((pair, j) => (pair?.leak ? [{ from: nets[i].name, to: nets[j].name }] : [])),
  );
  const rules = unifi ? buildRules(unifi, live.v4, snapshot.finishedAt, t) : [];
  const verifiedRules = rules.filter((r) => r.state === 'Felmért').length;

  const risks = buildRisks(unifi, pve, t);

  /*
   * Stores the survey was told about, whether or not it was told their size.
   *
   * A store that reports no figures used to be dropped here, which turned the
   * one case worth explaining — the API answered, but said nothing useful —
   * into an empty panel indistinguishable from having no Proxmox at all. It is
   * listed instead, marked as not measured, and `capacityNote` says why.
   */
  const stores = (pve?.storages ?? []).filter((s) => s.enabled || s.total > 0);
  const measured = stores.filter((s) => s.total > 0);

  const capacity: EstateBar[] = measured
    .sort((a, b) => pct(b.used, b.total) - pct(a.used, a.total))
    .slice(0, 6)
    .map<EstateBar>((s) => {
      const percent = pct(s.used, s.total);
      return {
        label: `${s.name} (${s.node})`,
        value: `${bytesLabel(s.used)} / ${bytesLabel(s.total)}`,
        percent,
        tone: percent >= 90 ? 'bad' : percent >= 80 ? 'warn' : 'accent',
      };
    });

  const sizeless = stores.filter((x) => x.total === 0);
  for (const s of sizeless.slice(0, 4)) {
    capacity.push({
      label: `${s.name} (${s.node})`,
      value: f.notMeasured,
      percent: 0,
      tone: 'idle',
    });
  }

  /*
   * Why the panel looks the way it does.
   *
   * Proxmox filters `/nodes/{node}/storage` by the caller's rights on each
   * store, so a token without Datastore.Audit is answered with an empty list
   * rather than an error — everything else in the survey succeeds and only the
   * capacity figures are missing. That is worth naming, because from the
   * outside it looks like the application failed to read them.
   *
   * A store that answered `active` is the one case that rules out "not
   * mounted", and only a positive reading proves it: an older snapshot taken
   * before the field existed reads false, which is absence of evidence rather
   * than evidence of absence.
   */
  const capacityNote = !pve
    ? undefined
    : stores.length === 0
      ? f.capacityNoStores
      : measured.length === 0
        ? sizeless.some((s) => s.active)
          ? f.capacityActiveNoFigures
          : f.capacityNoFigures
        : undefined;

  for (const n of pve?.nodes ?? []) {
    capacity.push({
      label: f.memoryOf(n.name),
      value: `${bytesLabel(n.memUsed)} / ${bytesLabel(n.memTotal)}`,
      percent: pct(n.memUsed, n.memTotal),
      tone: pct(n.memUsed, n.memTotal) >= 90 ? 'bad' : 'accent',
    });
  }

  const vms = pve?.guests.filter((g) => g.kind === 'qemu').length ?? 0;
  const cts = (pve?.guests.length ?? 0) - vms;
  const offline = unifi?.devices.filter((d) => d.state !== 1).length ?? 0;
  const critical = risks.filter((r) => r.severity === 'bad').length;

  const stats: EstateStat[] = [
    {
      label: f.statDevices,
      value: String(unifi?.devices.length ?? 0),
      hint: f.statDevicesHint((unifi?.devices.length ?? 0) - offline, offline),
      ...(offline > 0 ? { tone: 'bad' as Tone } : {}),
    },
    {
      label: f.statGuests,
      value: String(vms + cts),
      hint: f.statGuestsHint(vms, cts),
    },
    {
      label: f.statNetworks,
      value: String(zones.length),
      hint: f.statNetworksHint(zones.filter((z) => z.vlan !== '—').length),
    },
    {
      label: f.statRisks,
      value: String(risks.length),
      hint: f.statRisksHint(critical, risks.length - critical),
      ...(risks.length > 0 ? { tone: (critical > 0 ? 'bad' : 'warn') as Tone } : {}),
    },
    {
      label: f.statVerifiedRules,
      value: String(verifiedRules),
      suffix: ` / ${unifi?.firewallRules.length ?? 0}`,
      hint: live.v4.recognised ? f.statVerifiedRulesLive : f.statVerifiedRulesHint,
      tone: verifiedRules > 0 ? 'ok' : 'idle',
    },
  ];

  const backups = buildBackups(snapshot.proxmox, t);

  return {
    stats,
    capacity,
    ...(capacityNote ? { capacityNote } : {}),
    backups,
    // Derived from the same measurements as the risks, and from what the
    // backup summary established — a plan may not assume a restore point the
    // survey did not find.
    recommendations: recommendationsFromSnapshot(snapshot, backups, t),
    source: 'survey',
    surveyedAt: snapshot.finishedAt,
    nodes,
    links,
    zones,
    matrix,
    /*
     * Says which of the two the reader is looking at. The distinction is the
     * point of the panel, so leaving one note for both states would undo it.
     */
    matrixNote: live.v4.recognised
      ? t.policy.matrixNoteMeasured(matrix.length * matrix.length - unverifiedCells, live.v6.read)
      : t.policy.matrixNoteLive,
    liveRead: live.v4.read,
    rules,
    signals: buildSignals(unifi, pve, leaks, t),
    risks,
    scanLog: snapshot.log.map<ScanLogEntry>((l) => ({
      time: l.time,
      source: l.source,
      message: l.message,
    })),
    profiles: profiles.map<ConnectionProfile>((p) => ({
      name: p.label,
      url: `${p.baseUrl}${p.site ? ` · site "${p.site}"` : ''}`,
      mode: p.fingerprint ? f.profileReadOnly : f.profileNoCert,
      status: p.fingerprint ? 'ok' : 'warn',
      lastRun: p.lastRun ?? '—',
    })),
    counts,
  };
}
