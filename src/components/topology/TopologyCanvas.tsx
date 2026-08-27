import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NetLink, NetNode } from '@/data/model';
import { useT } from '@/i18n';
import { cx, vars } from '@/lib/css';
import { deepLink } from '@/lib/deeplink';
import { FIT_PAD, frameFor } from '@/lib/fit';
import { buildFlows, SPEED_STEPS, type PortLabel } from '@/lib/flows';
import { CANVAS_H, CANVAS_W, CHIP_H, CHIP_W, NODE_H, NODE_W } from '@/lib/geometry';
import {
  familyAreas,
  type FamilyArea,
  type NodeFamily,
  labelSize,
  labelSpot,
  outlineEdges,
  zoneAreas,
  type LabelBox,
} from '@/lib/zones';
import { familyHue, tint, type Palette, type Tone } from '@/lib/palette';
import { ZOOM_MAX, ZOOM_MIN } from '@/state/useAppState';
import { CaretIcon } from '../icons';
import { Dot } from '../ui';
import { NodeCard } from './NodeCard';

export interface TopologyCanvasProps {
  nodes: NetNode[];
  links: NetLink[];
  counts: Record<Tone, number>;
  palette: Palette;
  accent: string;
  selected: string;
  hovered: string | null;
  zoom: number;
  panX: number;
  panY: number;
  legendOpen: boolean;
  showLogical: boolean;
  showEstimated: boolean;
  animate: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onPan: (x: number, y: number) => void;
  onToggleLegend: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: (fit?: { zoom: number; panX: number; panY: number }) => void;
  /** How many cards the user has placed by hand; 0 means fully automatic. */
  arranged?: number;
  onMoveNode?: (id: string, x: number, y: number) => void;
  onResetLayout?: () => void;
}

/**
 * How far a boundary's name reaches above its own top edge.
 *
 * The label sits on the line rather than inside it, so anything framing a
 * boundary has to reserve this much more than the box asks for — otherwise the
 * name is the one thing the fit cuts off.
 */
const LABEL_REACH = 6;

interface DragOrigin {
  x: number;
  y: number;
  panX: number;
  panY: number;
}

/** Where a card was, and where the pointer was, when its drag began. */
interface NodeDrag {
  id: string;
  pointerX: number;
  pointerY: number;
  nodeX: number;
  nodeY: number;
  /** Set once the pointer has travelled far enough for this to be a drag. */
  moved: boolean;
}

export function TopologyCanvas(props: TopologyCanvasProps) {
  const {
    nodes,
    links,
    counts,
    palette,
    accent,
    selected,
    hovered,
    zoom,
    panX,
    panY,
    legendOpen,
    showLogical,
    showEstimated,
    animate,
    onSelect,
    onHover,
    onPan,
    onToggleLegend,
    onZoomIn,
    onZoomOut,
    onZoomFit,
    arranged = 0,
    onMoveNode,
    onResetLayout,
  } = props;

  const t = useT();
  const dragRef = useRef<DragOrigin | null>(null);
  const nodeDragRef = useRef<NodeDrag | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [panning, setPanning] = useState(false);
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  /*
   * Which cards belong together, outlined.
   *
   * On by default: the grouping is what the map was missing, and a hint nobody
   * finds is no hint. Off is one click away for a map being read cable by
   * cable, where the outlines are one thing too many.
   */
  const [showZones, setShowZones] = useState(true);

  /*
   * The group the view is currently framed on, if any.
   *
   * Kept only so that a click on the background knows whether it has anything
   * to undo: with nothing focused, empty space is empty space and clicking it
   * must not rearrange a view the reader has panned by hand.
   */
  const [focused, setFocused] = useState<NodeFamily | null>(null);

  /*
   * Whether the pointer travelled between going down and coming up.
   *
   * A drag across the map ends with a click on whatever is under the pointer,
   * and a pan that lands on a boundary must not be read as someone asking to
   * zoom into it. The mouseup clears the drag itself, so this outlives it.
   */
  const panMoved = useRef(false);

  // Hover highlights take precedence over the current selection.
  const focus = hovered ?? selected;

  const { flows, marks, ports } = useMemo(
    () =>
      buildFlows({
        nodes,
        links,
        palette,
        accent,
        focus,
        showLogical,
        showEstimated,
        animate,
      }),
    [nodes, links, palette, accent, focus, showLogical, showEstimated, animate],
  );

  const areas = useMemo(() => (showZones ? zoneAreas(nodes) : []), [nodes, showZones]);
  const families = useMemo(() => (showZones ? familyAreas(nodes) : []), [nodes, showZones]);

  /*
   * Where each boundary's name goes.
   *
   * Worked out together for all of them, and against the port chips, because
   * the corner a name wants is often where a cable comes down into the first
   * card of the group — and a name under a chip is unreadable. The families
   * are placed first: their names are the coarser ones, so a zone gives way
   * rather than the other way round.
   */
  const labels = useMemo(() => {
    if (!showZones) return { family: [] as LabelBox[], zone: [] as LabelBox[] };

    const chips: LabelBox[] = ports.map((p) => ({
      x: p.x - CHIP_W / 2,
      y: p.y - CHIP_H / 2,
      w: CHIP_W,
      h: CHIP_H,
    }));

    // Every other outline's lines. A name may sit inside a boundary; on one it
    // is unreadable, and so is the line.
    const edges = [...families, ...areas].map((area) => ({ area, bands: outlineEdges(area) }));
    const others = (mine: unknown) =>
      edges.filter((e) => e.area !== mine).flatMap((e) => e.bands);

    const taken: LabelBox[] = [];
    const family = families.map((area) => {
      const spot = labelSpot(
        area,
        labelSize(t.topology.familyName[area.family], true),
        [...chips, ...taken],
        others(area),
      );
      taken.push(spot);
      return spot;
    });
    const zone = areas.map((area) => {
      const spot = labelSpot(
        area,
        labelSize(t.topology.zoneName[area.zone], false),
        [...chips, ...taken],
        others(area),
      );
      taken.push(spot);
      return spot;
    });
    return { family, zone };
  }, [showZones, families, areas, ports, t]);

  const startPan = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      dragRef.current = { x: e.clientX, y: e.clientY, panX, panY };
      panMoved.current = false;
      setPanning(true);
    },
    [panX, panY],
  );

  /*
   * Dragging one card rather than the whole map.
   *
   * The pointer moves in screen pixels and the cards live in canvas ones, so
   * the movement is divided by the zoom — otherwise a drag at 40% would send
   * the card two and a half times as far as the hand went.
   *
   * A click and a drag start identically, so the move is only committed once
   * the pointer has actually travelled: selecting a device by clicking it must
   * not nudge it a pixel sideways.
   */
  const startNodeDrag = useCallback(
    (e: React.MouseEvent, node: NetNode) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      if (!onMoveNode) return;
      nodeDragRef.current = {
        id: node.id,
        pointerX: e.clientX,
        pointerY: e.clientY,
        nodeX: node.x,
        nodeY: node.y,
        moved: false,
      };
      setDraggingNode(node.id);
    },
    [onMoveNode],
  );

  useEffect(() => {
    if (!draggingNode) return;

    const move = (e: MouseEvent) => {
      const origin = nodeDragRef.current;
      if (!origin || !onMoveNode) return;
      const dx = (e.clientX - origin.pointerX) / zoom;
      const dy = (e.clientY - origin.pointerY) / zoom;
      if (!origin.moved && Math.hypot(dx, dy) < 3) return;
      origin.moved = true;
      onMoveNode(origin.id, origin.nodeX + dx, origin.nodeY + dy);
    };
    const end = () => {
      nodeDragRef.current = null;
      setDraggingNode(null);
    };

    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', end);
    };
  }, [draggingNode, onMoveNode, zoom]);

  // Listening on the window rather than the canvas keeps the drag alive when
  // the pointer leaves the viewport, and avoids retargeting node clicks the
  // way pointer capture would.
  useEffect(() => {
    if (!panning) return;

    const move = (e: MouseEvent) => {
      const origin = dragRef.current;
      if (!origin) return;
      if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) >= 3) panMoved.current = true;
      onPan(origin.panX + (e.clientX - origin.x), origin.panY + (e.clientY - origin.y));
    };
    const end = () => {
      dragRef.current = null;
      setPanning(false);
    };

    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', end);
    };
  }, [panning, onPan]);

  /**
   * How much room the view has, and what the pan is solved against.
   *
   * Two things have to be measured rather than assumed. The content is not the
   * canvas: nodes occupy a fraction of it, and fitting the canvas leaves the
   * estate small in the middle of an empty field. And the visible area is not
   * the window: the inspector takes the right-hand side and the legend sits
   * over the bottom, so both are subtracted before anything is scaled.
   */
  const measure = useCallback(() => {
    const viewport = viewportRef.current;
    const surface = viewport?.firstElementChild;
    if (!viewport || !(surface instanceof HTMLElement) || nodes.length === 0) return null;

    // The overlay bars sit over the bottom of the canvas, so that strip is not
    // somewhere the estate can be put.
    const BOTTOM_BARS = 78;
    return {
      viewport,
      surface,
      available: viewport.clientWidth,
      usable: viewport.clientHeight - BOTTOM_BARS,
    };
  }, [nodes.length]);

  /**
   * Puts one canvas point in the middle of the view, at a given zoom.
   *
   * Where a canvas point lands on screen is read off the live transform rather
   * than reconstructed from the stylesheet. The surface is a flex item with a
   * percentage-resolved transform origin, and predicting that from first
   * principles is exactly the kind of arithmetic that is quietly wrong on one
   * axis — which is how this landed off-centre before.
   *
   * So it is solved as a move from where things are now. A point at local p
   * sits at `edge + z·p + origin·(1 − z) + pan`, and `edge` — where the
   * surface lands untransformed — is not worth reconstructing: it is a flex
   * item in a scroll container, and the browser shifts it to keep overflowing
   * content reachable. Reading one measured position and cancelling the terms
   * leaves
   *
   *     pan' = target − seen + z·at − z'·centre + origin·(z' − z) + pan
   *
   * which needs no assumption about the layout at all. The measured point and
   * the point being framed are two different things here: `at` is the cards'
   * centre, which is the one place on the map whose position on screen can be
   * read off the DOM, while `centre` is wherever the caller wants the middle
   * of the view to end up. Letting them differ is the whole of what makes
   * framing a single group possible rather than only the estate entire.
   */
  const placeFrame = useCallback(
    (
      view: { viewport: HTMLElement; surface: HTMLElement; available: number; usable: number },
      want: { zoom: number; centreX: number; centreY: number },
    ) => {
      const { viewport, surface, available, usable } = view;

      const style = getComputedStyle(surface);
      const [originX = 0, originY = 0] = style.transformOrigin.split(' ').map(parseFloat);
      const box = viewport.getBoundingClientRect();

      // Where the cards' centre is on screen right now...
      const rects = [...surface.querySelectorAll('.node')].map((el) => el.getBoundingClientRect());
      if (rects.length === 0) {
        onZoomFit();
        return;
      }
      const seenX =
        (Math.min(...rects.map((r) => r.left)) + Math.max(...rects.map((r) => r.right))) / 2 -
        box.left;
      const seenY =
        (Math.min(...rects.map((r) => r.top)) + Math.max(...rects.map((r) => r.bottom))) / 2 -
        box.top;

      // ...and where that same point is in canvas coordinates.
      const atX =
        (Math.min(...nodes.map((n) => n.x)) + Math.max(...nodes.map((n) => n.x + NODE_W))) / 2;
      const atY =
        (Math.min(...nodes.map((n) => n.y)) + Math.max(...nodes.map((n) => n.y + NODE_H))) / 2;

      const shift = want.zoom - zoom;
      onZoomFit({
        zoom: want.zoom,
        panX:
          available / 2 - seenX + zoom * atX - want.zoom * want.centreX + originX * shift + panX,
        panY: usable / 2 - seenY + zoom * atY - want.zoom * want.centreY + originY * shift + panY,
      });
    },
    [nodes, onZoomFit, zoom, panX, panY],
  );

  /** Frames everything that is actually drawn. */
  const fitToContent = useCallback(() => {
    const view = measure();
    if (!view) {
      onZoomFit();
      return;
    }

    /*
     * The cables have to be measured rather than derived: the bow that clears
     * an obstacle is picked while drawing, so how far a link reaches is only
     * known from the path it ended up as. `getBBox` reports that in canvas
     * coordinates — the same space the node positions are in — regardless of
     * the transform currently on the surface.
     */
    const drawnBox = view.surface.querySelector('svg')?.getBBox();
    const drawn =
      drawnBox && drawnBox.width > 0
        ? {
            minX: drawnBox.x,
            minY: drawnBox.y,
            maxX: drawnBox.x + drawnBox.width,
            maxY: drawnBox.y + drawnBox.height,
          }
        : null;

    /*
     * The outlines are framed with the cards.
     *
     * They are HTML rather than SVG, so they are not in the drawn bounds — and
     * being the outermost thing on the map, leaving them out is exactly how a
     * fit ends with a boundary running off the top of the view. The label sits
     * above its box's top edge, so a little more is reserved there.
     */
    const outlines = [
      ...families.map((a) => ({ minX: a.x, minY: a.y - LABEL_REACH, maxX: a.x + a.w, maxY: a.y + a.h })),
      ...areas.map((a) => ({ minX: a.x, minY: a.y, maxX: a.x + a.w, maxY: a.y + a.h })),
    ];

    const fit = frameFor({
      nodes,
      ports,
      drawn,
      areas: outlines,
      available: view.available,
      usable: view.usable,
      zoomMin: ZOOM_MIN,
      zoomMax: ZOOM_MAX,
    });
    if (!fit) {
      onZoomFit();
      return;
    }

    placeFrame(view, fit);
  }, [nodes, ports, areas, families, measure, placeFrame, onZoomFit]);

  /*
   * Clicking a group brings that group up close.
   *
   * The outline already says which cards are one part of the estate; being
   * able to click it is what makes that grouping worth having on a map too big
   * to read at once. Nothing about the estate changes — this is the view
   * moving, exactly as the zoom buttons move it, which is why clicking away is
   * enough to undo and nothing has to be put back.
   */
  const focusFamily = useCallback(
    (area: FamilyArea) => {
      const view = measure();
      if (!view) return;

      // The label rides just above the top edge, so the framed box starts
      // there rather than at the line: a name cut off by the edge of the view
      // is the same failure as a boundary that runs off it.
      const top = area.y - LABEL_REACH;
      const height = area.y + area.h - top;

      placeFrame(view, {
        zoom: Math.max(
          ZOOM_MIN,
          Math.min(
            ZOOM_MAX,
            Math.min(
              view.available / (area.w + FIT_PAD * 2),
              view.usable / (height + FIT_PAD * 2),
            ),
          ),
        ),
        centreX: area.x + area.w / 2,
        centreY: top + height / 2,
      });
      setFocused(area.family);
    },
    [measure, placeFrame],
  );

  /** Back out of a group, to the estate entire. */
  const showEstate = useCallback(() => {
    setFocused(null);
    fitToContent();
  }, [fitToContent]);

  /*
   * And clicking outside it puts the whole estate back.
   *
   * Only the background counts as outside. A click on a card is someone asking
   * about that device, and having the view jump at the same time would answer
   * a question nobody asked — the inspector opening is the whole of what that
   * click means.
   */
  const clickAway = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (panMoved.current || focused === null) return;
      if (e.target instanceof Element && e.target.closest('.node')) return;
      showEstate();
    },
    [focused, showEstate],
  );

  /*
   * `?fit=1` frames the estate as soon as it is drawn.
   *
   * The documentation captures need this: a screenshot of the opening view
   * shows a map cut off at both edges, which is not what the view looks like
   * to someone using it. Waiting a frame is what makes it work — the cards have
   * to be laid out before there is anything to measure.
   */
  useEffect(() => {
    if (!deepLink().fit || nodes.length === 0) return;
    const frame = requestAnimationFrame(() => fitToContent());
    return () => cancelAnimationFrame(frame);
    // Once, when the estate first has nodes: refitting on every change would
    // undo whatever the user had panned to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length === 0]);

  return (
    <div
      ref={viewportRef}
      className={cx('canvas', panning && 'canvas--panning')}
      onMouseDown={startPan}
      onClick={clickAway}
    >
      <div
        style={{
          position: 'relative',
          width: CANVAS_W,
          height: CANVAS_H,
          // The canvas is a flex container, so this surface is a flex item and
          // gets shrunk to the viewport width by default. That silently makes
          // its box narrower than the coordinates drawn on it, and
          // `transform-origin: center` then resolves to the wrong point — the
          // whole surface scales about somewhere it is not.
          flex: 'none',
          transformOrigin: 'center center',
          transform: `translate(${panX}px,${panY}px) scale(${zoom})`,
        }}
      >
        <svg
          width={CANVAS_W}
          height={CANVAS_H}
          viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
          style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}
          aria-hidden="true"
        >
          {flows.map((f, i) => (
            <g key={`flow-${i}`}>
              <path
                d={f.d}
                fill="none"
                stroke={f.color}
                strokeWidth={f.baseWidth}
                strokeLinecap="round"
                opacity={f.baseOpacity}
              />
              <path
                d={f.d}
                fill="none"
                stroke={f.color}
                strokeWidth={f.width}
                strokeDasharray={f.dash}
                strokeLinecap="round"
                opacity={f.opacity}
                style={{ animation: f.animation }}
              />
            </g>
          ))}
          {/* Leaders tying each port number to the exact spot on its own
              curve. Two edges leaving a card almost parallel end up with
              their labels side by side, and a number floating between two
              lines belongs to neither — this is what says which. */}
          {ports.map((p, i) => {
            const dx = p.x - p.ax;
            const dy = p.y - p.ay;
            const displaced = Math.hypot(dx, dy) > 3;
            return (
              <g key={`lead-${i}`}>
                {displaced ? (
                  <line
                    x1={p.ax}
                    y1={p.ay}
                    x2={p.x}
                    y2={p.y}
                    stroke={p.color}
                    strokeWidth={1.2}
                    opacity={0.75}
                  />
                ) : null}
                <circle cx={p.ax} cy={p.ay} r={2.4} fill={p.color} />
              </g>
            );
          })}
          {marks.map((m, i) => (
            <g key={`mark-${i}`} transform={m.transform}>
              <circle r={m.radius} fill={m.background} stroke={m.borderColor} strokeWidth={1} />
              <path
                d={m.d}
                fill={m.fill}
                stroke={m.stroke}
                strokeWidth={m.strokeWidth}
                strokeLinecap="round"
              />
            </g>
          ))}
        </svg>

        {/*
          * The families, behind everything: one plain rectangle each, because
          * the layout keeps a family in its own column all the way down and a
          * box that steps in and out on every row is harder to follow than the
          * cards it was drawn to help with.
          */}
        {families.map((area, i) => (
          <button
            type="button"
            key={`family-${area.family}-${i}`}
            className={cx('family-area', focused === area.family && 'family-area--focused')}
            title={
              focused === area.family
                ? t.topology.showEstate
                : t.topology.focusFamily(t.topology.familyName[area.family])
            }
            aria-label={
              focused === area.family
                ? t.topology.showEstate
                : t.topology.focusFamily(t.topology.familyName[area.family])
            }
            onClick={(e) => {
              // The click that ends a pan is not a click on what it landed on.
              if (panMoved.current) return;
              e.stopPropagation();
              /*
               * The group already framed backs out again.
               *
               * The pointer says as much — it turns to a zoom-out over a
               * framed group — and a control that shows one thing and does
               * another is worse than one that does nothing. Clicking the
               * background does this too; both are here because the reader
               * whose eye is on the group they zoomed into does not
               * necessarily have anywhere else to aim.
               */
              if (focused === area.family) showEstate();
              else focusFamily(area);
            }}
            style={vars(
              {
                // One hue per family — the accent for the estate's own
                // network, orange for the hypervisor, violet for the internet:
                // see familyHue.
                '--zone-line': tint(familyHue(area.family, palette, accent), '59'),
                '--zone-fill': tint(familyHue(area.family, palette, accent), '0a'),
                '--zone-label': familyHue(area.family, palette, accent),
              },
              { left: area.x, top: area.y, width: area.w, height: area.h },
            )}
          >
            <span
              className="family-area__label"
              style={{
                left: (labels.family[i]?.x ?? area.x) - area.x,
                top: (labels.family[i]?.y ?? area.y) - area.y,
              }}
            >
              {t.topology.familyName[area.family]}
            </span>
          </button>
        ))}

        {/*
          * The outlines go on before the cards and after the cables: they are
          * a backdrop, and a card or a port number disappearing behind one
          * would be a poor trade for a grouping hint.
          */}
        {showZones
          ? areas.map((area, i) => (
              <div
                key={`zone-${area.zone}-${i}`}
                className="zone-area"
                style={vars(
                  {
                    // The colour of the family this sits inside, not a
                    // colour per zone: the status colours already mean
                    // something on this map, and a second set of meanings in
                    // the same picture is one too many. The zones are told
                    // apart by their labels, and an inner outline in a hue
                    // other than its own family's would read as belonging to
                    // the other one.
                    '--zone-line': tint(familyHue(area.family, palette, accent), '80'),
                    // No wash: the family outline this sits inside already
                    // carries one, and two washes over each other read as a
                    // third colour nobody chose.
                    '--zone-fill': 'transparent',
                    '--zone-label': 'var(--text2)',
                  },
                  { left: area.x, top: area.y, width: area.w, height: area.h },
                )}
                aria-hidden="true"
              >
                <span
                  className="zone-area__label"
                  style={{
                    left: (labels.zone[i]?.x ?? area.x) - area.x,
                    top: (labels.zone[i]?.y ?? area.y) - area.y,
                  }}
                >
                  <span className="zone-area__dot" />
                  {t.topology.zoneName[area.zone]}
                </span>
              </div>
            ))
          : null}

        {nodes.map((node) => (
          <NodeCard
            key={node.id}
            node={node}
            selected={node.id === selected}
            hovered={node.id === hovered}
            palette={palette}
            accent={accent}
            dragging={draggingNode === node.id}
            onSelect={() => onSelect(node.id)}
            onEnter={() => onHover(node.id)}
            onLeave={() => onHover(null)}
            {...(onMoveNode ? { onDragStart: (e) => startNodeDrag(e, node) } : {})}
          />
        ))}

        {/* Port numbers sit on the edges rather than on the cards: the
            question they answer is "which cable is this", and that is a
            property of the link, not of either device. */}
        {ports.map((p, i) => (
          <PortChip key={`port-${i}`} label={p} t={t} />
        ))}
      </div>

      <div
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 14,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px 12px',
          pointerEvents: 'none',
        }}
      >
        <div className="overlay-bar">
          <button
            type="button"
            className="legend-toggle"
            aria-expanded={legendOpen}
            onClick={onToggleLegend}
          >
            <span
              style={{
                fontSize: 10,
                letterSpacing: '.06em',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
              }}
            >
              {t.topology.legend}
            </span>
            <CaretIcon flipped={legendOpen} />
          </button>

          {legendOpen ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '10px 16px',
                minWidth: 0,
              }}
            >
              <LegendLine color={palette.idle} style="solid" label={t.topology.surveyed} />
              <LegendLine color={palette.warn} style="dashed" label={t.topology.estimated} />
              <LegendLine color={accent} style="dotted" label={t.topology.logical} />
              <LegendLine color={palette.bad} style="dashed" label={t.topology.broken} />
              <div style={{ width: 1, height: 16, background: 'var(--line2)', flex: 'none' }} />

              {/* The port chips are coloured by negotiated speed, so the scale
                  has to be readable somewhere or the colour says nothing. */}
              <span style={{ fontSize: 10, color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                {t.topology.portSpeed}
              </span>
              {SPEED_STEPS.map((step) => (
                <div
                  key={step.key}
                  style={{ display: 'flex', flex: 'none', alignItems: 'center', gap: 5 }}
                >
                  <span
                    style={{ width: 10, height: 10, borderRadius: 3, background: step.color }}
                  />
                  <span style={{ fontSize: 10.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                    {t.topology.speeds[step.key]}
                  </span>
                </div>
              ))}
              <div style={{ width: 1, height: 16, background: 'var(--line2)', flex: 'none' }} />

              <svg width="22" height="12" viewBox="0 0 22 12" style={{ flex: 'none' }}>
                <title>{t.topology.bidirectional}</title>
                <path d="M1 3.5 H21" stroke={palette.idle} strokeWidth={1.6} strokeDasharray="4 4" />
                <path d="M1 8.5 H21" stroke={palette.idle} strokeWidth={1.6} strokeDasharray="4 4" />
              </svg>
              <svg width="22" height="12" viewBox="0 0 22 12" style={{ flex: 'none' }}>
                <title>{t.topology.unidirectional}</title>
                <path d="M1 6 H21" stroke={palette.idle} strokeWidth={1.6} strokeDasharray="4 4" />
                <path d="M12 2.5 L17.5 6 L12 9.5 Z" fill={palette.idle} />
              </svg>
              <svg width="22" height="12" viewBox="0 0 22 12" style={{ flex: 'none' }}>
                <title>{t.topology.blocked}</title>
                <path
                  d="M1 6 H21"
                  stroke={palette.bad}
                  strokeWidth={1.6}
                  strokeDasharray="4 4"
                  opacity={0.5}
                />
                <path d="M8 3 L14 9 M14 3 L8 9" stroke={palette.bad} strokeWidth={1.6} />
              </svg>
            </div>
          ) : null}
        </div>

        <div className="overlay-bar" style={{ gap: '10px 14px' }}>
          <span
            style={{
              fontSize: 10,
              color: 'var(--text3)',
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}
          >
            {t.topology.state}
          </span>
          <StatusCount color={palette.ok} label={`${counts.ok} ${t.topology.online}`} />
          <StatusCount color={palette.warn} label={`${counts.warn} ${t.topology.warnings}`} />
          <StatusCount color={palette.bad} label={`${counts.bad} ${t.topology.errors}`} />
          <StatusCount color={palette.idle} label={`${counts.idle} ${t.topology.unknown}`} />
        </div>

        <div
          className="overlay-bar"
          style={{ flex: 'none', gap: 2, padding: 4, flexWrap: 'nowrap' }}
        >
          <button type="button" className="zoom-btn" onClick={onZoomOut} aria-label={t.topology.zoomOut}>
            −
          </button>
          <div
            className="mono"
            style={{ fontSize: 10.5, color: 'var(--text2)', width: 42, textAlign: 'center' }}
          >
            {Math.round(zoom * 100)}%
          </div>
          <button type="button" className="zoom-btn" onClick={onZoomIn} aria-label={t.topology.zoomIn}>
            +
          </button>
          <div style={{ width: 1, height: 16, background: 'var(--line)', margin: '0 3px' }} />
          <button
            type="button"
            className="zoom-btn"
            style={{ padding: '0 9px' }}
            onClick={fitToContent}
          >
            {t.topology.fit}
          </button>

          <div style={{ width: 1, height: 16, background: 'var(--line)', margin: '0 3px' }} />
          {/*
            * Grouping is a way of reading the map, not a property of it, so it
            * is a switch on the view rather than a setting to be found.
            */}
          <button
            type="button"
            className="zoom-btn"
            style={{ padding: '0 9px', ...(showZones ? { color: 'var(--accent)' } : {}) }}
            aria-pressed={showZones}
            title={t.topology.zonesHint}
            onClick={() => setShowZones((on) => !on)}
          >
            {t.topology.zonesToggle}
          </button>

          {/*
            * Only offered once something has been moved.
            *
            * A button that undoes an arrangement nobody made is noise, and
            * worse, it invites a click that appears to do nothing.
            */}
          {arranged > 0 && onResetLayout ? (
            <>
              <div style={{ width: 1, height: 16, background: 'var(--line)', margin: '0 3px' }} />
              <button
                type="button"
                className="zoom-btn"
                style={{ padding: '0 9px', color: 'var(--accent)' }}
                title={t.topology.arrangedBy(arranged)}
                onClick={onResetLayout}
              >
                {t.topology.resetLayout}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * One end of a cable, labelled with the port it lands on.
 *
 * The chevron says which way the link runs from this device's point of view:
 * up on the port that faces the upstream switch, down on the port that feeds
 * something below. Between the two chips you can read a cable off the map
 * without opening either device.
 */
function PortChip({ label, t }: { label: PortLabel; t: ReturnType<typeof useT> }) {
  return (
    <div
      title={`${label.title} · ${label.speed > 0 ? `${label.speed} Mb/s` : t.topology.portDown}`}
      style={{
        position: 'absolute',
        left: label.x,
        top: label.y,
        transform: 'translate(-50%,-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: 3,
        borderRadius: 7,
        background: 'var(--card)',
        border: '1px solid var(--line)',
        boxShadow: '0 1px 4px rgba(0,0,0,.18)',
        pointerEvents: 'none',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 18,
          height: 18,
          borderRadius: 5,
          background: label.color,
          flex: 'none',
        }}
      >
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
          <path
            d={label.uplink ? 'M2.5 7.5 L6 4 L9.5 7.5' : 'M2.5 4.5 L6 8 L9.5 4.5'}
            fill="none"
            stroke="#fff"
            strokeWidth={1.9}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span
        className="mono"
        style={{ fontSize: 11.5, lineHeight: 1, padding: '0 4px 0 1px', color: 'var(--text)' }}
      >
        {label.port}
      </span>
    </div>
  );
}

function LegendLine({
  color,
  style,
  label,
}: {
  color: string;
  style: 'solid' | 'dashed' | 'dotted';
  label: string;
}) {
  return (
    <div style={{ display: 'flex', flex: 'none', alignItems: 'center', gap: 7 }}>
      <div style={{ width: 20, borderTop: `2px ${style} ${color}` }} />
      <span style={{ fontSize: 10.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  );
}

function StatusCount({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', flex: 'none', alignItems: 'center', gap: 5 }}>
      <Dot color={color} size={7} />
      <span style={{ fontSize: 10.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  );
}
