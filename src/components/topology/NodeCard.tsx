import { NODE_KINDS, type NetNode } from '@/data/model';
import { DeviceIcon, glyphFor } from '../DeviceIcon';
import { vars } from '@/lib/css';
import type { Palette } from '@/lib/palette';
import { Dot } from '../ui';

export function NodeCard({
  node,
  selected,
  hovered,
  dragging,
  palette,
  accent,
  onSelect,
  onEnter,
  onLeave,
  onDragStart,
}: {
  node: NetNode;
  selected: boolean;
  hovered: boolean;
  /** True while this card is the one being dragged. */
  dragging?: boolean;
  palette: Palette;
  accent: string;
  onSelect: () => void;
  onEnter: () => void;
  onLeave: () => void;
  /** Absent where the map is read-only. */
  onDragStart?: (e: React.MouseEvent) => void;
}) {
  const borderColor = selected ? accent : hovered ? palette.line2 : palette.line;

  return (
    <button
      type="button"
      className="node"
      aria-pressed={selected}
      style={vars(
        {
          '--node-bg': selected ? palette.cardSelected : palette.card,
          '--node-bc': borderColor,
          '--node-sh': dragging
            ? `0 0 0 3px ${accent}44, 0 16px 34px rgba(0,0,0,.32)`
            : selected
              ? `0 0 0 3px ${accent}22, 0 10px 24px rgba(0,0,0,.22)`
              : '0 1px 2px rgba(0,0,0,.14)',
        },
        {
          left: node.x,
          top: node.y,
          // Lifted while held, so it passes over its neighbours rather than
          // under them, and the pointer says what the card will do.
          zIndex: dragging ? 5 : undefined,
          cursor: onDragStart ? (dragging ? 'grabbing' : 'grab') : undefined,
        },
      )}
      onClick={onSelect}
      onMouseDown={onDragStart}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Icon only at this size. The badge is 24px, and an icon plus its
            two-letter code crammed side by side reads as neither — the icon
            already says what the device is. The code stays in the inspector,
            where the badge is big enough for both, and in the title here. */}
        <div
          className="node__code"
          title={NODE_KINDS[node.kind].code}
          style={{ color: selected ? accent : palette.textMuted }}
        >
          <DeviceIcon glyph={glyphFor(node.kind, node.subtitle, node.name)} size={19} />
        </div>
        <div
          className="ellipsis"
          style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 500 }}
        >
          {node.name}
        </div>
        <Dot color={palette[node.status]} size={9} />
      </div>
      <div
        className="mono ellipsis"
        style={{ marginTop: 8, fontSize: 11, color: 'var(--text3)' }}
      >
        {node.subtitle}
      </div>
    </button>
  );
}
