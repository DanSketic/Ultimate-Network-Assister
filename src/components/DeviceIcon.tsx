import type { NodeKind } from '@/data/model';

/*
 * Device icons.
 *
 * These are original silhouettes of *kinds* of hardware — a rack switch with a
 * port row, an access point, a server, a dome camera. They are deliberately not
 * vendor logos: reproducing the Ubiquiti or Proxmox marks would put someone
 * else's trademark on our drawing, and a logo tells you who made a box while a
 * silhouette tells you what it does. On a topology map the second is the useful
 * one.
 *
 * Everything is drawn on a 24×24 grid with `currentColor` and no fills that
 * fight the theme, so one icon works on a card, in a list and inside a pill.
 */

export interface DeviceIconProps {
  size?: number;
  /** Stroke width at 24px; scaled with the icon. */
  weight?: number;
  style?: React.CSSProperties;
}

/** Model families we can tell apart from the survey's model string. */
export type DeviceGlyph =
  | 'cloud'
  | 'gateway'
  | 'switch8'
  | 'switch24'
  | 'ap'
  | 'server'
  | 'nas'
  | 'container'
  | 'vm'
  | 'service'
  | 'camera-dome'
  | 'camera-bullet'
  | 'nvr'
  | 'printer'
  | 'clients';

function Svg({
  size = 20,
  weight = 1.4,
  style,
  children,
}: DeviceIconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={weight}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {children}
    </svg>
  );
}

/** A row of ports along the bottom of a 1U face. */
function PortRow({ count, y = 14.4 }: { count: number; y?: number }) {
  const left = 4.6;
  const right = 19.4;
  const gap = (right - left) / count;
  return (
    <g>
      {Array.from({ length: count }, (_, i) => (
        <rect
          key={i}
          x={left + i * gap + gap * 0.16}
          y={y}
          width={gap * 0.68}
          height={1.9}
          rx={0.4}
          fill="currentColor"
          stroke="none"
          opacity={0.75}
        />
      ))}
    </g>
  );
}

const GLYPHS: Record<DeviceGlyph, (p: DeviceIconProps) => React.ReactElement> = {
  // Uplink: a cloud, kept simple so it reads at 14px.
  cloud: (p) => (
    <Svg {...p}>
      <path d="M6.5 17.5a3.5 3.5 0 0 1-.3-6.99A5 5 0 0 1 16 9.6a3.9 3.9 0 0 1 1.6 7.9Z" />
    </Svg>
  ),

  // Gateway: a 1U box with a WAN arrow entering and a LAN row leaving.
  gateway: (p) => (
    <Svg {...p}>
      <rect x="3" y="8" width="18" height="9.5" rx="1.6" />
      <path d="M12 3.4v3.2M10.4 5.2 12 3.4l1.6 1.8" />
      <PortRow count={5} />
    </Svg>
  ),

  switch8: (p) => (
    <Svg {...p}>
      <rect x="3" y="8" width="18" height="9.5" rx="1.6" />
      <circle cx="6.2" cy="10.6" r="0.75" fill="currentColor" stroke="none" />
      <PortRow count={4} />
    </Svg>
  ),

  // More ports means a denser row; the shape alone says "bigger switch".
  switch24: (p) => (
    <Svg {...p}>
      <rect x="2.4" y="7.6" width="19.2" height="10.4" rx="1.6" />
      <circle cx="5.4" cy="10.2" r="0.7" fill="currentColor" stroke="none" />
      <PortRow count={8} y={13.2} />
      <PortRow count={8} y={15.7} />
    </Svg>
  ),

  // Access point: a disc seen at an angle, with radiating arcs.
  ap: (p) => (
    <Svg {...p}>
      <ellipse cx="12" cy="16.6" rx="6.4" ry="2.6" />
      <path d="M8.6 12.1a4.6 4.6 0 0 1 6.8 0" />
      <path d="M6.2 9.1a8.2 8.2 0 0 1 11.6 0" />
      <circle cx="12" cy="16.4" r="0.9" fill="currentColor" stroke="none" />
    </Svg>
  ),

  // Server: a stack of 1U units, each with a drive light.
  server: (p) => (
    <Svg {...p}>
      <rect x="3.4" y="3.6" width="17.2" height="5.6" rx="1.3" />
      <rect x="3.4" y="10.6" width="17.2" height="5.6" rx="1.3" />
      <rect x="3.4" y="17.6" width="17.2" height="3.2" rx="1.1" />
      <circle cx="6.6" cy="6.4" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="6.6" cy="13.4" r="0.75" fill="currentColor" stroke="none" />
    </Svg>
  ),

  // Storage: a stack of platters — the shape everyone reads as "disk".
  nas: (p) => (
    <Svg {...p}>
      <ellipse cx="12" cy="6.4" rx="7.2" ry="2.8" />
      <path d="M4.8 6.4v5.2c0 1.55 3.22 2.8 7.2 2.8s7.2-1.25 7.2-2.8V6.4" />
      <path d="M4.8 11.6v5.2c0 1.55 3.22 2.8 7.2 2.8s7.2-1.25 7.2-2.8v-5.2" />
    </Svg>
  ),

  // Container: a box made of stacked layers.
  container: (p) => (
    <Svg {...p}>
      <rect x="4" y="4.6" width="16" height="14.8" rx="1.8" />
      <path d="M4 9.4h16M4 14.6h16" />
      <path d="M9.2 4.6v14.8" opacity="0.55" />
    </Svg>
  ),

  // Virtual machine: a screen with a nested frame — a machine inside a machine.
  vm: (p) => (
    <Svg {...p}>
      <rect x="2.8" y="4.4" width="18.4" height="13" rx="1.8" />
      <rect x="7.4" y="8.2" width="9.2" height="5.4" rx="1" opacity="0.6" />
      <path d="M9 20.4h6" />
    </Svg>
  ),

  // Service: a gear, the one shape nobody misreads.
  service: (p) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3 5.5 5.5" />
    </Svg>
  ),

  // Dome camera: a half-sphere on a ceiling plate.
  'camera-dome': (p) => (
    <Svg {...p}>
      <path d="M4.6 15.4a7.4 7.4 0 0 1 14.8 0Z" />
      <path d="M3 15.4h18" />
      <circle cx="12" cy="12.3" r="1.9" />
      <path d="M12 18.6v2.2" opacity="0.6" />
    </Svg>
  ),

  // Bullet camera: a barrel on a wall bracket.
  'camera-bullet': (p) => (
    <Svg {...p}>
      <rect x="5.2" y="8" width="12.4" height="6.6" rx="3.3" />
      <circle cx="15.2" cy="11.3" r="1.6" />
      <path d="M9.6 14.6v2.4M6.4 20.2h6.4" />
      <path d="M9.6 17h0" />
    </Svg>
  ),

  // Recorder: a 1U box with a record dot.
  nvr: (p) => (
    <Svg {...p}>
      <rect x="2.8" y="7" width="18.4" height="10" rx="1.7" />
      <circle cx="7" cy="12" r="1.9" />
      <path d="M11.6 10.2h6.2M11.6 13.8h4" opacity="0.65" />
    </Svg>
  ),

  printer: (p) => (
    <Svg {...p}>
      <path d="M7 8.6V3.8h10v4.8" />
      <rect x="3.4" y="8.6" width="17.2" height="7.4" rx="1.6" />
      <rect x="7" y="14" width="10" height="6.2" rx="1" />
      <circle cx="17.6" cy="11.4" r="0.8" fill="currentColor" stroke="none" />
    </Svg>
  ),

  // A group of clients: overlapping figures, not a crowd of detail.
  clients: (p) => (
    <Svg {...p}>
      <circle cx="9" cy="8.6" r="3.1" />
      <path d="M3.4 19.4a5.6 5.6 0 0 1 11.2 0" />
      <path d="M15.6 6.2a3.1 3.1 0 0 1 0 5.9" opacity="0.6" />
      <path d="M17 14.4a5.6 5.6 0 0 1 3.6 5" opacity="0.6" />
    </Svg>
  ),
};

/**
 * Picks a glyph from what the survey measured.
 *
 * The model string is the controller's own, so matching on it is matching on
 * fact rather than on a guess about naming. Anything unrecognised falls back to
 * the node kind, which is always known.
 */
export function glyphFor(kind: NodeKind, model = '', name = ''): DeviceGlyph {
  const m = `${model} ${name}`.toLowerCase();

  if (/dome|g\d-dome|ai-360|flex/.test(m)) return 'camera-dome';
  if (/bullet|g\d-bullet|g\d-pro|ai-pro/.test(m)) return 'camera-bullet';
  if (/nvr|protect|recorder/.test(m)) return 'nvr';
  if (/printer|laserjet|officejet|mfc|brother|ecosys/.test(m)) return 'printer';

  switch (kind) {
    case 'cloud':
      return 'cloud';
    case 'gateway':
      return 'gateway';
    case 'switch':
      // 16 or more ports gets the denser face.
      return /(?:^|[^\d])(16|24|48)(?:[^\d]|$)/.test(m) ? 'switch24' : 'switch8';
    case 'ap':
      return 'ap';
    case 'host':
      return 'server';
    case 'storage':
      return 'nas';
    case 'ct':
      return 'container';
    case 'vm':
      return 'vm';
    case 'svc':
      return 'service';
    case 'clients':
      return 'clients';
    default:
      return 'service';
  }
}

export function DeviceIcon({
  glyph,
  size,
  weight,
  style,
}: DeviceIconProps & { glyph: DeviceGlyph }) {
  return GLYPHS[glyph]({ size, weight, style });
}
