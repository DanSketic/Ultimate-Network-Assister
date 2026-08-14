import { LINK_KINDS, type NetLink, type NetNode } from '@/data/model';
import { CHIP_H, CHIP_W, edgeGeometry, isVerticalRun, NODE_H, NODE_W } from './geometry';
import type { Palette } from './palette';

/** One drawn strand of an edge. Bidirectional links produce two. */
export interface FlowLane {
  d: string;
  /** Static under-stroke that keeps the edge visible between dashes. */
  baseWidth: number;
  baseOpacity: number;
  color: string;
  width: number;
  dash: string;
  opacity: number;
  /** CSS animation shorthand, or 'none' for dead / paused links. */
  animation: string;
}

/** Arrowhead or "no traffic" cross at the midpoint of a one-way edge. */
export interface FlowMark {
  transform: string;
  radius: number;
  background: string;
  borderColor: string;
  d: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
}

/**
 * A port number sitting on one end of an edge.
 *
 * This is measured data or nothing: the port comes from the switch's own port
 * table, matched to its LLDP neighbour. Where the far end does not announce
 * itself, no chip is drawn rather than a guessed one — a wrong port number on
 * a topology map is worse than none, because someone will unplug that cable.
 */
export interface PortLabel {
  x: number;
  y: number;
  /**
   * The point on the curve this label belongs to.
   *
   * Kept separate from the label's own position because the two drift apart:
   * two edges leaving a card almost parallel put their labels side by side,
   * and a number sitting between two lines belongs to neither. A leader drawn
   * back to this point says which one, whatever the spacing.
   */
  ax: number;
  ay: number;
  /** Port number as printed on the case. */
  port: number;
  /** True on the end that faces upstream; drives the chevron direction. */
  uplink: boolean;
  /** Negotiated speed in Mbit/s; 0 when the port is down. */
  speed: number;
  /** Speed colour — what the chip is actually telling you. */
  color: string;
  /** Node this port belongs to, so hovering can dim the rest. */
  nodeId: string;
  /** Full description for the title attribute. */
  title: string;
}

/**
 * Link speeds, in the order they are tested.
 *
 * The chip is coloured by negotiated speed rather than by the link it sits on,
 * which is the one thing a port colour can usefully say: a gigabit port that
 * has quietly fallen back to 100 Mbit is invisible in every other view, and it
 * is the first thing to look for when something feels slow.
 *
 * `key` names the legend entry; the palette is the same in both themes so the
 * colours mean one thing everywhere.
 */
export const SPEED_STEPS = [
  { min: 10000, color: '#8b5cf6', key: 'speed10g' },
  { min: 2500, color: '#3b82f6', key: 'speed2g5' },
  { min: 1000, color: '#22c55e', key: 'speed1g' },
  { min: 100, color: '#f59e0b', key: 'speed100m' },
  { min: 1, color: '#ef4444', key: 'speed10m' },
] as const;

export function speedColor(speed: number, palette: Palette): string {
  return SPEED_STEPS.find((s) => speed >= s.min)?.color ?? palette.idle;
}

export interface FlowOptions {
  nodes: NetNode[];
  links: NetLink[];
  palette: Palette;
  accent: string;
  /** Node whose edges are highlighted — hover wins over selection. */
  focus: string | null;
  showLogical: boolean;
  showEstimated: boolean;
  animate: boolean;
}

/** Lateral separation between the two lanes of a bidirectional link. */
const LANE_OFFSET = 2.6;

/** Ideal gap between two edges leaving the same side of a card. */
const FAN_STEP = 30;

/**
 * Works out where each edge should leave each card.
 *
 * Edges are grouped by the card side they depart from and ordered by where
 * they are heading, then spread evenly along that side. Ordering by direction
 * is what stops the lines crossing each other immediately after they leave —
 * the leftmost target gets the leftmost anchor.
 *
 * `bows` matters here and is easy to miss: an edge routed around an obstacle
 * sets off the opposite way from its destination. Ordering by the destination
 * alone then hands it an anchor on the wrong side of its neighbours, and the
 * two swap places in the first few pixels — which is exactly the tangle this
 * function exists to prevent. So the sort key is where the curve actually
 * heads, detour included.
 *
 * The result is keyed `linkIndex:from` / `linkIndex:to`.
 */
function fanAnchors(links: { a: NetNode; b: NetNode }[], bows: number[]): Map<string, number> {
  interface Exit {
    key: string;
    /** Position of the far end along the departure edge, for ordering. */
    toward: number;
    vertical: boolean;
  }

  const groups = new Map<string, Exit[]>();

  const add = (node: NetNode, other: NetNode, key: string, vertical: boolean, bow: number) => {
    // Which side of the card the edge leaves from.
    const side = vertical
      ? other.y > node.y
        ? 'bottom'
        : 'top'
      : other.x > node.x
        ? 'right'
        : 'left';
    const list = groups.get(`${node.id}:${side}`) ?? [];
    list.push({ key, toward: (vertical ? other.x : other.y) + bow, vertical });
    groups.set(`${node.id}:${side}`, list);
  };

  links.forEach(({ a, b }, i) => {
    const vertical = isVerticalRun(a, b);
    const bow = bows[i] ?? 0;
    add(a, b, `${i}:from`, vertical, bow);
    add(b, a, `${i}:to`, vertical, bow);
  });

  const anchors = new Map<string, number>();
  for (const exits of groups.values()) {
    if (exits.length === 1) {
      anchors.set(exits[0]!.key, 0);
      continue;
    }
    // Keep the fan inside the card, short of the rounded corners.
    const limit = exits[0]!.vertical ? NODE_W / 2 - 18 : NODE_H / 2 - 12;
    const step = Math.min(FAN_STEP, (limit * 2) / (exits.length - 1));

    exits
      .slice()
      .sort((x, y) => x.toward - y.toward)
      .forEach((exit, index) => {
        anchors.set(exit.key, (index - (exits.length - 1) / 2) * step);
      });
  }

  return anchors;
}

/** Highlighted edges cycle faster. */
const FOCUS_SPEEDUP = 0.55;

/** Draw order: lower goes down first, so cables sit above the overlays. */
function layer(link: NetLink): number {
  if (link.kind === 'logical') return 0;
  if (link.kind === 'wireless') return 1;
  return 2;
}

function strokeColor(link: NetLink, focused: boolean, palette: Palette, accent: string): string {
  if (focused) return accent;
  const tone = LINK_KINDS[link.kind].strokeTone;
  return tone === 'accent' ? accent : palette[tone];
}

export function buildFlows({
  nodes,
  links,
  palette,
  accent,
  focus,
  showLogical,
  showEstimated,
  animate,
}: FlowOptions): { flows: FlowLane[]; marks: FlowMark[]; ports: PortLabel[] } {
  const flows: FlowLane[] = [];
  const marks: FlowMark[] = [];
  const ports: PortLabel[] = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));

  /** The port on `node` that LLDP says faces `other`, if it announced one. */
  const portFacing = (node: NetNode, other: NetNode) =>
    node.ports?.find((p) => p.neighbour && p.neighbour === other.name);

  // Placed close in on purpose: a port number belongs to the device it is on,
  // and the card-clearance pass below guarantees it still does not touch it.
  const CHIP_INSET = 26;

  // Only edges that will actually be drawn take part in the fan, so hiding
  // the logical overlay re-spreads the remaining ones instead of leaving gaps.
  const visible = links
    .flatMap((link) => {
      const a = byId.get(link.from);
      const b = byId.get(link.to);
      if (!a || !b) return [];
      if (link.kind === 'logical' && !showLogical) return [];
      if (link.kind === 'wireless' && !showEstimated) return [];
      return [{ link, a, b }];
    })
    // Overlays first, so they end up underneath. A management path crossing a
    // cable should read as passing behind it; drawn on top it looks like the
    // two meet, which is the one thing the picture must not suggest.
    .sort((x, y) => layer(x.link) - layer(y.link));

  /*
   * Detours are settled first: an edge routed around an obstacle leaves its
   * card the opposite way from its destination, and the fan has to order it by
   * where it really goes or the two swap places right at the card.
   *
   * Every kind is routed, overlays included: a line crossing a card reads as
   * ending there whether it is dotted or not, and that is the confusion worth
   * removing.
   */
  /*
   * Whoever has no choice goes first.
   *
   * A cable with a clear run between its two cards is drawn straight whatever
   * else happens — the short hop between two switches side by side is the
   * common case — so its route is settled before anything picks a detour. The
   * cables that do have to bend then choose knowing where the fixed ones lie,
   * counting a crossing against any bow that would run over one, and the
   * longest goes first because it has the most cards to get past.
   *
   * Doing it the other way round leaves the long cable free to bow into the
   * one place a short cable was always going to occupy.
   */
  const span = ({ a, b }: { a: NetNode; b: NetNode }) => Math.abs(a.y - b.y);

  const route = (at: Map<string, number>) => {
    const bows = new Array<number>(visible.length).fill(0);
    const settled: Point[][] = [];
    const anchorsOf = (i: number) =>
      [at.get(`${i}:from`) ?? 0, at.get(`${i}:to`) ?? 0] as const;

    const bends = visible.map(({ a, b }, i) => {
      const [x, y] = anchorsOf(i);
      return !straightIsClear(a, b, x, y, nodes);
    });
    visible.forEach(({ a, b }, i) => {
      if (!bends[i]) settled.push(trace(a, b, ...anchorsOf(i), 0));
    });

    for (const index of visible
      .map((_, i) => i)
      .filter((i) => bends[i])
      .sort((i, j) => span(visible[j]!) - span(visible[i]!))) {
      const { a, b } = visible[index]!;
      const [x, y] = anchorsOf(index);
      const bow = routeAround(a, b, x, y, nodes, settled);
      bows[index] = bow;
      settled.push(trace(a, b, x, y, bow));
    }
    return bows;
  };

  /*
   * Routed twice, because the two decisions depend on each other.
   *
   * Where an edge leaves its card is decided by the fan, and the fan orders
   * edges by the detour each one takes — so the detour has to be chosen first,
   * with the endpoints still in the middle of the card. Once the fan has moved
   * them, the curve is no longer quite the one that was checked, which is
   * enough to put a line back across its neighbour. A second pass re-routes
   * against the endpoints the edge will actually be drawn from.
   *
   * The answer is then kept. Hovering a device re-runs this whole function to
   * restyle the lines, but it moves nothing — recomputing routes on every
   * mouse move made the map lag, and the result was identical every time.
   */
  const { anchors, bows } = remember(visible, () => {
    const first = fanAnchors(visible, route(new Map()));
    const settledBows = route(first);
    return { anchors: fanAnchors(visible, settledBows), bows: settledBows };
  });

  visible.forEach(({ link, a: from, b: to }, index) => {
    const anchorA = anchors.get(`${index}:from`) ?? 0;
    const anchorB = anchors.get(`${index}:to`) ?? 0;
    const bow = bows[index] ?? 0;
    const meta = LINK_KINDS[link.kind];
    const focused = link.from === focus || link.to === focus;
    const color = strokeColor(link, focused, palette, accent);
    // A broken link, or one with no traffic, is drawn but never animated.
    const dead = link.direction === 'none' || link.kind === 'broken';
    const duration = `${focused ? meta.duration * FOCUS_SPEEDUP : meta.duration}s`;

    const addLane = (offset: number, reverse: boolean) => {
      const geo = edgeGeometry(from, to, offset, anchorA, anchorB, bow);
      flows.push({
        d: geo.d,
        baseWidth: focused ? 1.5 : 1.1,
        baseOpacity: focused ? 0.55 : meta.baseOpacity,
        color,
        width: focused ? meta.strokeWidth + 0.6 : meta.strokeWidth,
        dash: meta.dash,
        opacity: focused ? 1 : meta.opacity,
        animation:
          dead || !animate
            ? 'none'
            : `napFlow${reverse ? 'R' : 'F'} ${duration} linear infinite`,
      });
      return geo;
    };

    /**
     * Puts a port number on each end that reported one.
     *
     * Only physical links carry ports: a wireless association and a logical
     * management path do not run through a switch port, and labelling them
     * would invent a fact.
     */
    const addPorts = (geo: ReturnType<typeof edgeGeometry>) => {
      if (link.kind !== 'physical' && link.kind !== 'broken') return;
      const ends = [
        { node: from, other: to, fromStart: true },
        { node: to, other: from, fromStart: false },
      ] as const;

      for (const end of ends) {
        const port = portFacing(end.node, end.other);
        if (!port) continue;

        // Measured out from the card edge, not by curve parameter — see
        // `outFrom`. Now that edges leave the card at different points, each
        // chip lands on its own line from the start.
        const at = geo.outFrom(end.fromStart, CHIP_INSET);

        const speed = port.up ? port.speed : 0;
        ports.push({
          x: at.x,
          y: at.y,
          ax: at.x,
          ay: at.y,
          port: port.idx,
          uplink: port.uplink,
          speed,
          color: speedColor(speed, palette),
          nodeId: end.node.id,
          title: `${end.node.name} · ${port.idx}${port.name ? ` (${port.name})` : ''} → ${end.other.name}`,
        });
      }
    };

    if (link.direction === 'both') {
      addLane(-LANE_OFFSET, false);
      addPorts(addLane(LANE_OFFSET, true));
      return;
    }

    const geo = addLane(0, link.direction === 'ba');
    addPorts(geo);

    if (dead) {
      marks.push({
        transform: `translate(${geo.mx},${geo.my})`,
        radius: 7.5,
        background: palette.card,
        borderColor: palette.line,
        d: 'M-3.1 -3.1 L3.1 3.1 M3.1 -3.1 L-3.1 3.1',
        fill: 'none',
        stroke: palette.bad,
        strokeWidth: 1.5,
      });
    } else {
      const angle = link.direction === 'ba' ? geo.angle + 180 : geo.angle;
      marks.push({
        transform: `translate(${geo.mx},${geo.my}) rotate(${angle})`,
        radius: 6.5,
        background: palette.card,
        borderColor: palette.line,
        d: 'M-2.2 -3.3 L3.3 0 L-2.2 3.3 Z',
        fill: color,
        stroke: 'none',
        strokeWidth: 0,
      });
    }
  });

  separate(ports, nodes);
  return { flows, marks, ports };
}

/** Clearance kept between a routed edge and a card it is not attached to. */
const OBSTACLE_MARGIN = 8;

/**
 * Bow amounts tried when an edge has to get out of the way.
 *
 * Ordered smallest first so the search settles on the gentlest detour that
 * works, and stops as soon as one is completely clear.
 */
const BOWS = [
  0, 60, -60, 110, -110, 165, -165, 225, -225, 290, -290,
  360, -360, 440, -440, 530, -530, 630, -630,
];

interface Point {
  x: number;
  y: number;
}

interface Routing {
  anchors: Map<string, number>;
  bows: number[];
}

/**
 * Holds the last routing, so restyling does not re-solve the geometry.
 *
 * Only the estate's shape and where its cards sit can change a route. Colour,
 * focus and the animation state cannot, yet they are what change most often —
 * every hover. One entry is enough: the map being looked at is the map being
 * hovered.
 */
let lastRouting: { key: string; value: Routing } | null = null;

function remember(
  visible: { link: NetLink; a: NetNode; b: NetNode }[],
  solve: () => Routing,
): Routing {
  const key = visible.map(({ link, a, b }) => `${link.from}>${link.to}@${a.x},${a.y};${b.x},${b.y}`).join('|');
  if (lastRouting?.key === key) return lastRouting.value;
  const value = solve();
  lastRouting = { key, value };
  return value;
}

/** Samples an edge into a polyline, for comparing one route against another. */
function trace(
  from: NetNode,
  to: NetNode,
  anchorA: number,
  anchorB: number,
  bow: number,
): Point[] {
  const geo = edgeGeometry(from, to, 0, anchorA, anchorB, bow);
  return Array.from({ length: 29 }, (_, i) => geo.sample(i / 28));
}

const turn = (a: Point, b: Point, p: Point) =>
  Math.sign((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x));

function bounds(line: Point[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of line) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * How close two cables may run before they read as one.
 *
 * Two lines that merely touch are as hard to follow as two that cross: the eye
 * loses which strand it was tracing. This is in canvas units, so it survives
 * zooming out — which is exactly when strands start to merge.
 */
const CLEARANCE = 24;

/** Distance from p to the segment ab. */
function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Whether two cables cross, and whether they run too close to each other.
 *
 * Both ends are skipped, and generously: edges that share a card converge on
 * it by design, and the fan that spreads them is what keeps those ends apart.
 * What is judged here is the middle, where two cables have no business being
 * in the same place.
 */
function conflicts(one: Point[], other: Point[]): { crosses: boolean; near: number } {
  const verdict = { crosses: false, near: 0 };

  // Most pairs are nowhere near each other; comparing boxes first keeps this
  // off the hot path of every hover.
  const boxA = bounds(one);
  const boxB = bounds(other);
  if (
    boxA.maxX + CLEARANCE < boxB.minX ||
    boxB.maxX + CLEARANCE < boxA.minX ||
    boxA.maxY + CLEARANCE < boxB.minY ||
    boxB.maxY + CLEARANCE < boxA.minY
  ) {
    return verdict;
  }

  const skip = 1;
  for (let i = skip; i < one.length - skip - 1; i++) {
    const a = one[i]!;
    const b = one[i + 1]!;
    let closest = Infinity;
    for (let j = skip; j < other.length - skip - 1; j++) {
      const c = other[j]!;
      const d = other[j + 1]!;
      if (turn(a, b, c) !== turn(a, b, d) && turn(c, d, a) !== turn(c, d, b)) {
        verdict.crosses = true;
        return verdict;
      }
      const gap = distanceToSegment(a, c, d);
      if (gap < closest) closest = gap;
    }
    // Counted per sample rather than answered yes or no: where nothing can be
    // kept fully clear, the route that stays closest to clear should still win.
    if (closest < CLEARANCE) verdict.near += 1;
  }
  return verdict;
}

/**
 * Finds a bow that steers this edge clear of the cards in between.
 *
 * A line drawn straight through a device card reads as though it terminates
 * there — someone tracing a cable follows it into the wrong box. So an edge
 * with something standing in its way is bowed sideways until it goes round.
 *
 * Candidates are scored by how much of the curve is still buried in a card,
 * not merely pass/fail. Some runs cross a whole row and no bow clears every
 * card; taking the least-obstructed one is much better than giving up and
 * drawing straight through, which is what a pass/fail search does.
 *
 * Ties go to the smaller detour: a straight line is easier to follow than a
 * sweeping one, so the curve only bends as far as it has to.
 */
const SAMPLES = 28;

/*
 * How bad a route is, worst problem first.
 *
 * Running through a card outweighs everything: a line that disappears into a
 * box is read as ending there, which is a wrong statement about the network.
 * Crossing another cable comes next, and grazing one after that — untidy
 * rather than misleading, but still a strand the eye can lose.
 */
function pathCost(
  from: NetNode,
  to: NetNode,
  anchorA: number,
  anchorB: number,
  obstacles: NetNode[],
  settled: Point[][],
  bow: number,
): number {
  const geo = edgeGeometry(from, to, 0, anchorA, anchorB, bow);
  const path: Point[] = [];
  for (let i = 0; i <= SAMPLES; i++) path.push(geo.sample(i / SAMPLES));

  let inside = 0;
  for (let i = 1; i < SAMPLES; i++) {
    const p = path[i]!;
    for (const n of obstacles) {
      if (
        p.x > n.x - OBSTACLE_MARGIN &&
        p.x < n.x + NODE_W + OBSTACLE_MARGIN &&
        p.y > n.y - OBSTACLE_MARGIN &&
        p.y < n.y + NODE_H + OBSTACLE_MARGIN
      ) {
        inside++;
        break;
      }
    }
  }

  let crossed = 0;
  let grazed = 0;
  for (const other of settled) {
    const { crosses, near } = conflicts(path, other);
    if (crosses) crossed++;
    else grazed += near;
  }
  return inside * 10_000 + crossed * 100 + grazed;
}

const others = (from: NetNode, to: NetNode, nodes: NetNode[]) =>
  nodes.filter((n) => n.id !== from.id && n.id !== to.id);

/** Whether the straight run between two cards is already clear of everything. */
function straightIsClear(
  from: NetNode,
  to: NetNode,
  anchorA: number,
  anchorB: number,
  nodes: NetNode[],
): boolean {
  return pathCost(from, to, anchorA, anchorB, others(from, to, nodes), [], 0) === 0;
}

function routeAround(
  from: NetNode,
  to: NetNode,
  anchorA: number,
  anchorB: number,
  nodes: NetNode[],
  settled: Point[][] = [],
): number {
  const obstacles = others(from, to, nodes);
  if (obstacles.length === 0 && settled.length === 0) return 0;

  const cost = (bow: number) =>
    pathCost(from, to, anchorA, anchorB, obstacles, settled, bow);

  let best = 0;
  let bestScore = cost(0);
  if (bestScore === 0) return 0;

  const consider = (bow: number) => {
    const score = cost(bow);
    // A strict improvement wins; an equal one only if it bends less.
    if (score < bestScore || (score === bestScore && Math.abs(bow) < Math.abs(best))) {
      best = bow;
      bestScore = score;
    }
    return bestScore === 0;
  };

  for (const bow of BOWS) {
    if (bow !== 0 && consider(bow)) return best;
  }

  // The coarse ladder can straddle a gap without landing in it — a row of
  // cards with one opening is exactly that shape. Refine around the best
  // candidate before settling for a curve that still clips something.
  for (const delta of [30, -30, 60, -60, 15, -15, 45, -45, 90, -90]) {
    if (consider(best + delta)) return best;
  }
  return best;
}

/** Chip footprint in canvas units, with a little air around it. */

/** Gap kept between a chip and a card — close, but not touching. */
const CARD_CLEARANCE = 5;

/**
 * Nudges overlapping chips apart.
 *
 * Spacing them along their own curves is not always enough: a short edge
 * cannot hold two chips at all, and edges leaving one card converge no matter
 * where you sample them. So whatever still overlaps is pushed apart in screen
 * space, along whichever axis needs the least movement.
 *
 * The displacement is capped. A chip that drifts far from its line stops
 * saying which cable it belongs to, and at that point a slight overlap is the
 * lesser problem — so past the cap it is left where it is rather than moved
 * somewhere misleading.
 */
function separate(ports: PortLabel[], nodes: NetNode[]): void {
  const MAX_SHIFT = 22;
  const PASSES = 16;
  const origin = ports.map((p) => ({ x: p.x, y: p.y }));

  for (let pass = 0; pass < PASSES; pass++) {
    let moved = false;

    // Cards come first: a chip lying on a device card is unreadable whatever
    // the other chips do, and pushing it clear may create a chip-to-chip
    // overlap that the pass below then resolves.
    for (const p of ports) {
      for (const node of nodes) {
        const gapX = (CHIP_W + NODE_W) / 2 + CARD_CLEARANCE - Math.abs(p.x - (node.x + NODE_W / 2));
        const gapY = (CHIP_H + NODE_H) / 2 + CARD_CLEARANCE - Math.abs(p.y - (node.y + NODE_H / 2));
        if (gapX <= 0 || gapY <= 0) continue;

        if (gapY <= gapX) {
          p.y += (gapY + 0.5) * Math.sign(p.y - (node.y + NODE_H / 2) || 1);
        } else {
          p.x += (gapX + 0.5) * Math.sign(p.x - (node.x + NODE_W / 2) || 1);
        }
        moved = true;
      }
    }

    for (let i = 0; i < ports.length; i++) {
      for (let j = i + 1; j < ports.length; j++) {
        const a = ports[i]!;
        const b = ports[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const gapX = CHIP_W - Math.abs(dx);
        const gapY = CHIP_H - Math.abs(dy);
        if (gapX <= 0 || gapY <= 0) continue;

        // Half each, in opposite directions, on the cheaper axis. Coincident
        // centres get an arbitrary but stable push so they cannot deadlock.
        if (gapY <= gapX) {
          const push = (gapY / 2 + 0.5) * (dy === 0 ? (i % 2 ? 1 : -1) : Math.sign(dy));
          a.y -= push;
          b.y += push;
        } else {
          const push = (gapX / 2 + 0.5) * (dx === 0 ? (i % 2 ? 1 : -1) : Math.sign(dx));
          a.x -= push;
          b.x += push;
        }
        moved = true;
      }
    }

    for (let i = 0; i < ports.length; i++) {
      const p = ports[i]!;
      const home = origin[i]!;
      const dx = p.x - home.x;
      const dy = p.y - home.y;
      const drift = Math.hypot(dx, dy);
      if (drift > MAX_SHIFT) {
        p.x = home.x + (dx / drift) * MAX_SHIFT;
        p.y = home.y + (dy / drift) * MAX_SHIFT;
      }
    }

    if (!moved) break;
  }

  for (const p of ports) {
    p.x = Math.round(p.x * 100) / 100;
    p.y = Math.round(p.y * 100) / 100;
  }
}
