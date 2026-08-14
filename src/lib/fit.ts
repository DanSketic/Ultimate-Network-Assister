/*
 * Works out what part of the canvas the topology view should frame.
 *
 * Kept apart from the component because the interesting cases are the ones a
 * demo estate never produces — a cable that swings wide around an obstacle,
 * a chip pushed past the outermost card — and those are worth testing on made
 * up numbers rather than waiting for an estate that happens to show them.
 *
 * The component still owns everything that needs the DOM: how big the viewport
 * is, where the paths actually landed, and turning the answer into a pan.
 */

import { CHIP_H, CHIP_W, NODE_H, NODE_W } from './geometry';

export interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface FitInput {
  /** Card top-left corners, in canvas coordinates. */
  nodes: { x: number; y: number }[];
  /** Port chip centres. */
  ports: { x: number; y: number }[];
  /** Bounds of everything drawn in the SVG layer, or null if nothing is. */
  drawn: Rect | null;
  /** Visible width, and height less whatever the overlay bars cover. */
  available: number;
  usable: number;
  zoomMin: number;
  zoomMax: number;
}

export interface Fit {
  zoom: number;
  /** The point to put in the middle of the visible area. */
  centreX: number;
  centreY: number;
  /** The region that framing reserves room for. Symmetric about the centre. */
  frame: Rect;
}

/** Breathing room left at the edges. */
export const FIT_PAD = 28;

/**
 * Frames the estate around the cards, with room for whatever hangs off them.
 *
 * The centre comes from the cards alone. A cable that bows out to get around
 * an obstacle reaches out on one side only, and letting it move the centre
 * leaves the estate visibly shoved the other way — so the reach it needs is
 * mirrored instead, which both keeps the line on screen and keeps the devices
 * looking centred.
 */
export function frameFor(input: FitInput): Fit | null {
  const { nodes, ports, drawn, available, usable, zoomMin, zoomMax } = input;
  if (nodes.length === 0 || available <= 0 || usable <= 0) return null;

  const centreX =
    (Math.min(...nodes.map((n) => n.x)) + Math.max(...nodes.map((n) => n.x + NODE_W))) / 2;
  const centreY =
    (Math.min(...nodes.map((n) => n.y)) + Math.max(...nodes.map((n) => n.y + NODE_H))) / 2;

  let reachX = 0;
  let reachY = 0;
  const reach = (minX: number, minY: number, maxX: number, maxY: number) => {
    reachX = Math.max(reachX, centreX - minX, maxX - centreX);
    reachY = Math.max(reachY, centreY - minY, maxY - centreY);
  };

  for (const n of nodes) reach(n.x, n.y, n.x + NODE_W, n.y + NODE_H);
  for (const p of ports) {
    reach(p.x - CHIP_W / 2, p.y - CHIP_H / 2, p.x + CHIP_W / 2, p.y + CHIP_H / 2);
  }
  if (drawn) reach(drawn.minX, drawn.minY, drawn.maxX, drawn.maxY);

  const halfW = reachX + FIT_PAD;
  const halfH = reachY + FIT_PAD;

  return {
    zoom: Math.max(
      zoomMin,
      Math.min(zoomMax, Math.min(available / (halfW * 2), usable / (halfH * 2))),
    ),
    centreX,
    centreY,
    frame: {
      minX: centreX - halfW,
      maxX: centreX + halfW,
      minY: centreY - halfH,
      maxY: centreY + halfH,
    },
  };
}
