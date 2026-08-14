/** Topology node card size, in canvas units. */
export const NODE_W = 176;
export const NODE_H = 76;

/** Port chip size. Both the separation pass and the fit reserve room by it. */
export const CHIP_W = 52;
export const CHIP_H = 28;

/**
 * The grid the demo estate's coordinates are written against.
 *
 * Those positions are hand-placed, so growing the cards would make them
 * collide — the authored layout has pairs sitting exactly one card-width
 * apart. `demoNodes` scales them instead, and the scale is derived from the
 * card growth rather than picked, so resizing a card can never reintroduce an
 * overlap that has to be found by eye.
 */
export const AUTHORED_W = 1190;
export const AUTHORED_H = 620;
const AUTHORED_NODE_W = 138;

/**
 * Breathing room on top of the card growth.
 *
 * The authored layout puts some rows a bare 20 units apart, which at the
 * current card size leaves gaps too narrow to read between — and too narrow
 * for an edge to route through, so lines end up crossing cards instead of
 * going round them.
 */
const AIR = 1.2;

export const AUTHOR_SCALE = (NODE_W / AUTHORED_NODE_W) * AIR;
export const CANVAS_W = Math.round(AUTHORED_W * AUTHOR_SCALE);
export const CANVAS_H = Math.round(AUTHORED_H * AUTHOR_SCALE);

export interface Placed {
  x: number;
  y: number;
}

export interface EdgeGeometry {
  /** SVG cubic path from edge of A to edge of B. */
  d: string;
  /** Midpoint, where the direction marker sits. */
  mx: number;
  my: number;
  /** Tangent angle at the midpoint, in degrees. */
  angle: number;
  /** Straight-line distance between the endpoints, for spacing labels. */
  span: number;
  /** Point on the curve at `t`. */
  sample: (t: number) => Placed;
  /**
   * A point `distance` away from one end, measured as the crow flies.
   *
   * `t` is not arc length: on a curve that leaves a card perpendicular and
   * then bends, a given `t` can be much nearer the card than it looks. Walking
   * out until the distance is really met is what keeps a label clear of the
   * card it belongs to.
   */
  outFrom: (fromStart: boolean, distance: number) => Placed;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Point on a cubic bezier at parameter `t`. */
function pointAt(q: [Placed, Placed, Placed, Placed], t: number): Placed {
  const u = 1 - t;
  const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return {
    x: round2(w[0]! * q[0].x + w[1]! * q[1].x + w[2]! * q[2].x + w[3]! * q[3].x),
    y: round2(w[0]! * q[0].y + w[1]! * q[1].y + w[2]! * q[2].y + w[3]! * q[3].y),
  };
}


/** True when this pair is joined top-to-bottom rather than side-to-side. */
export function isVerticalRun(a: Placed, b: Placed): boolean {
  return Math.abs(b.y - a.y) > 40;
}

/**
 * Routes an edge between two node cards as a cubic bezier that leaves and
 * enters perpendicular to the card edge.
 *
 * Cards more than 40 units apart vertically are joined top-to-bottom; anything
 * flatter is joined side-to-side. `offset` shifts the whole curve sideways,
 * which is how bidirectional links get two parallel lanes.
 *
 * `anchorA` and `anchorB` slide each endpoint along the card edge it leaves
 * from. Without them every edge would depart from the card's centre, so a
 * switch feeding six access points produces six lines emerging from one pixel
 * — unreadable, and with nowhere to put a port label. The caller fans them out;
 * see flows.ts.
 *
 * `bow` pushes the two control points sideways, bulging the middle of the
 * curve without moving either end. That is how an edge is steered around a
 * card standing between its endpoints.
 */
export function edgeGeometry(
  a: Placed,
  b: Placed,
  offset = 0,
  anchorA = 0,
  anchorB = 0,
  bow = 0,
): EdgeGeometry {
  const A = { x: a.x + NODE_W / 2, y: a.y + NODE_H / 2 };
  const B = { x: b.x + NODE_W / 2, y: b.y + NODE_H / 2 };

  let points: Placed[];
  // Which axis the offset is applied along: perpendicular to the run.
  let normalX: number;
  let normalY: number;

  if (isVerticalRun(a, b)) {
    const dir = B.y > A.y ? 1 : -1;
    const y1 = A.y + (dir * NODE_H) / 2;
    const y2 = B.y - (dir * NODE_H) / 2;
    const curve = Math.abs(y2 - y1) * 0.45;
    const ax = A.x + anchorA;
    const bx = B.x + anchorB;
    points = [
      { x: ax, y: y1 },
      { x: ax + bow, y: y1 + dir * curve },
      { x: bx + bow, y: y2 - dir * curve },
      { x: bx, y: y2 },
    ];
    normalX = 1;
    normalY = 0;
  } else {
    const dir = B.x > A.x ? 1 : -1;
    const x1 = A.x + (dir * NODE_W) / 2;
    const x2 = B.x - (dir * NODE_W) / 2;
    const curve = Math.abs(x2 - x1) * 0.5;
    const ay = A.y + anchorA;
    const by = B.y + anchorB;
    points = [
      { x: x1, y: ay },
      { x: x1 + dir * curve, y: ay + bow },
      { x: x2 - dir * curve, y: by + bow },
      { x: x2, y: by },
    ];
    normalX = 0;
    normalY = 1;
  }

  const q = points.map((p) => ({
    x: round2(p.x + normalX * offset),
    y: round2(p.y + normalY * offset),
  })) as [Placed, Placed, Placed, Placed];

  // Derivative of the cubic at t = 0.5, up to a constant factor.
  const tx = 0.25 * (q[1].x - q[0].x) + 0.5 * (q[2].x - q[1].x) + 0.25 * (q[3].x - q[2].x);
  const ty = 0.25 * (q[1].y - q[0].y) + 0.5 * (q[2].y - q[1].y) + 0.25 * (q[3].y - q[2].y);

  const sample = (t: number) => pointAt(q, t);

  return {
    d: `M${q[0].x} ${q[0].y} C ${q[1].x} ${q[1].y} ${q[2].x} ${q[2].y} ${q[3].x} ${q[3].y}`,
    mx: round2((q[0].x + q[3].x) / 2),
    my: round2((q[0].y + q[3].y) / 2),
    angle: round2((Math.atan2(ty, tx) * 180) / Math.PI),
    span: Math.hypot(q[3].x - q[0].x, q[3].y - q[0].y) || 1,
    sample,
    outFrom: (fromStart, distance) => {
      const anchor = fromStart ? q[0] : q[3];
      // Coarse walk out from the end; 40 steps is finer than a label needs.
      for (let step = 1; step <= 16; step++) {
        const t = fromStart ? step / 40 : 1 - step / 40;
        const p = sample(t);
        if (Math.hypot(p.x - anchor.x, p.y - anchor.y) >= distance) return p;
      }
      // A very short edge: settle for as far out as it goes without crossing
      // the midpoint, where the other end's label lives.
      return sample(fromStart ? 0.4 : 0.6);
    },
  };
}
