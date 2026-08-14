import type { Tone } from '@/lib/palette';

/* ------------------------------------------------------------------ shared */

/**
 * Where a statement came from. The application never treats an unverified
 * claim as a basis for a change, so this travels with every derived fact.
 */
export type Provenance = 'Felmért' | 'Becsült' | 'Nem ellenőrzött' | 'Nem ellenőrizhető';

export type Severity = 'bad' | 'warn' | 'info';

/**
 * `info` maps to the neutral tone rather than a status colour: it is a note,
 * not a problem.
 */
export const SEVERITY_TONE: Record<Severity, Tone> = {
  bad: 'bad',
  warn: 'warn',
  info: 'idle',
};

/* ------------------------------------------------------------------- nodes */

export type NodeKind =
  | 'cloud'
  | 'gateway'
  | 'switch'
  | 'ap'
  | 'clients'
  | 'host'
  | 'storage'
  | 'ct'
  | 'vm'
  | 'svc';

export interface NodeKindMeta {
  /** Short code shown on the node card and in the inspector header. */
  code: string;
}

// The readable names live in the dictionary (`labels.nodeKind`); only the
// code, which is the same in every language, belongs to the data.
export const NODE_KINDS: Record<NodeKind, NodeKindMeta> = {
  cloud: { code: 'IN' },
  gateway: { code: 'GW' },
  switch: { code: 'SW' },
  ap: { code: 'AP' },
  clients: { code: 'CL' },
  host: { code: 'PVE' },
  storage: { code: 'ZFS' },
  ct: { code: 'CT' },
  vm: { code: 'VM' },
  svc: { code: 'SVC' },
};

/** Zone a node sits in. `WAN` is outside every VLAN. */
export type ZoneKey = 'WAN' | 'Mgmt' | 'IoT' | 'Servers';

export interface Fact {
  key: string;
  value: string;
}

export interface Metric {
  label: string;
  value: string;
  /** 0–100; drives both the bar width and its colour threshold. */
  percent: number;
}

export interface NodeService {
  name: string;
  detail: string;
  status: Tone;
  provenance: Provenance;
}

export interface NodeWarning {
  severity: Severity;
  text: string;
}

export interface NetNode {
  id: string;
  kind: NodeKind;
  name: string;
  subtitle: string;
  status: Tone;
  /** Top-left position on the topology canvas. */
  x: number;
  y: number;
  zone: ZoneKey;
  facts: Fact[];
  metrics: Metric[];
  services: NodeService[];
  warnings: NodeWarning[];
  /**
   * Physical ports, for devices that have them.
   *
   * On a surveyed estate these come from the switch's own port table joined to
   * its LLDP neighbours. The demo fixture carries a sample set so the port
   * layout is visible before a survey has run — the whole estate is labelled
   * as demo there, so nothing is being passed off as measured.
   */
  ports?: NodePort[];
}

/**
 * One port, as measured.
 *
 * `neighbour` is empty when the far end does not announce itself over LLDP.
 * That is a different fact from an empty port, and `up` is what separates them.
 */
export interface NodePort {
  idx: number;
  name: string;
  up: boolean;
  enabled: boolean;
  /** Negotiated speed in Mbit/s; 0 when down. */
  speed: number;
  poe: boolean;
  poePower: string;
  /** What the controller passes on this port: "all", "disabled" or a group. */
  vlanMode: string;
  neighbour: string;
  neighbourPort: string;
  uplink: boolean;
}

/* ------------------------------------------------------------------- links */

export type LinkKind = 'physical' | 'wireless' | 'logical' | 'broken';

/** `ab` / `ba` are one-way; `none` means traffic does not pass at all. */
export type LinkDirection = 'both' | 'ab' | 'ba' | 'none';

// As with NODE_KINDS: the readable name comes from `labels.linkKind`, only the
// drawing and provenance facts live here.
export interface LinkKindMeta {
  provenance: Provenance;
  /** Tone for the connection chip in the inspector. */
  tone: Tone | 'accent';
  /** Tone for the edge stroke on the canvas — deliberately not the same. */
  strokeTone: Tone | 'accent';
  strokeWidth: number;
  dash: string;
  /** Seconds for one dash cycle; 0 means the link does not animate. */
  duration: number;
  opacity: number;
  /** Opacity of the static under-stroke. */
  baseOpacity: number;
}

export const LINK_KINDS: Record<LinkKind, LinkKindMeta> = {
  physical: {
    provenance: 'Felmért',
    tone: 'ok',
    strokeTone: 'idle',
    strokeWidth: 1.5,
    dash: '5 7',
    duration: 2.4,
    opacity: 0.9,
    baseOpacity: 0.3,
  },
  wireless: {
    provenance: 'Becsült',
    tone: 'warn',
    strokeTone: 'warn',
    strokeWidth: 1.4,
    dash: '5 7',
    duration: 3.0,
    opacity: 0.8,
    baseOpacity: 0.26,
  },
  logical: {
    provenance: 'Felmért',
    tone: 'accent',
    strokeTone: 'accent',
    strokeWidth: 1.3,
    dash: '2 6',
    duration: 3.4,
    opacity: 0.72,
    baseOpacity: 0.22,
  },
  broken: {
    provenance: 'Nem ellenőrizhető',
    tone: 'bad',
    strokeTone: 'bad',
    strokeWidth: 1.5,
    dash: '4 6',
    duration: 0,
    opacity: 0.8,
    baseOpacity: 0.26,
  },
};

export interface NetLink {
  from: string;
  to: string;
  kind: LinkKind;
  direction: LinkDirection;
  /**
   * Overrides the kind's default provenance. A surveyed estate needs this: a
   * management path can be read from configuration (so it is a logical link)
   * while still being inferred rather than measured.
   */
  provenance?: Provenance;
}

/** Provenance of a link, falling back to whatever its kind implies. */
export function linkProvenance(link: NetLink): Provenance {
  return link.provenance ?? LINK_KINDS[link.kind].provenance;
}

/* ------------------------------------------------------------------ policy */

export interface Zone {
  vlan: string;
  name: string;
  net: string;
  ssid: string;
  devices: number;
  isolation: string;
  state: Provenance;
}

/** allow · block · limited · unverified */
export type MatrixCell = 'a' | 'b' | 'l' | 'u';

export interface FirewallRule {
  src: string;
  dst: string;
  port: string;
  action: 'Engedélyez' | 'Tilt';
  state: Provenance;
  checkedAt: string;
}

export interface SecuritySignal {
  severity: Severity;
  title: string;
  text: string;
  zone: string;
}

/* ------------------------------------------------------------------ advice */

export interface Risk {
  severity: Severity;
  title: string;
  where: string;
  text: string;
}

export type StepState = 'kész' | 'folyamatban' | 'vár';

export interface ChangeStep {
  name: string;
  text: string;
  state: StepState;
}

export interface Recommendation {
  id: string;
  severity: Severity;
  title: string;
  where: string;
  impact: string;
  risk: 'Alacsony' | 'Közepes' | 'Magas';
  duration: string;
  why: string;
  steps: ChangeStep[];
}

/* -------------------------------------------------------------- operations */

export interface ConnectionProfile {
  name: string;
  url: string;
  mode: string;
  status: Tone;
  lastRun: string;
}

export interface ScanLogEntry {
  time: string;
  source: string;
  message: string;
}

export type BackupEvidence = 'Igazolt' | 'Részleges' | 'Hiányzik' | 'Elavult';

export interface BackupJob {
  name: string;
  target: string;
  schedule: string;
  lastRun: string;
  retention: string;
  evidence: BackupEvidence;
  /** Why the evidence is what it is. Empty on the demo estate. */
  reason?: string;
}

/**
 * What could actually be established about backups.
 *
 * The distinction the rest of the view rests on: a job proves intent, a file
 * proves it ran, and a verification proves the file is readable. Only a Proxmox
 * Backup Server store reports the third, so `verifiable` says whether the
 * absence of verification means "failed" or "cannot be known from here".
 */
export interface BackupSummary {
  jobs: BackupJob[];
  /** Guests with no backup file at all — the list worth acting on. */
  unprotected: { vmid: number; name: string }[];
  guestCount: number;
  protectedCount: number;
  /** Age of the newest backup in the estate, in days; null when there is none. */
  newestAgeDays: number | null;
  /** True where at least one store reports verification state. */
  verifiable: boolean;
  /** Backup stores and how full they are. */
  stores: { name: string; usedPercent: number; freeLabel: string }[];
}

export interface SshCommand {
  label: string;
  command: string;
  host: string;
}

/* ------------------------------------------------------------------ planner */

export interface TemplateVlan {
  vlan: string;
  name: string;
  net: string;
  use: string;
}

export interface TemplateSsid {
  name: string;
  meta: string;
}

export interface DeploymentTemplate {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  vlans: TemplateVlan[];
  ssids: TemplateSsid[];
  services: string[];
}

/* ---------------------------------------------------------------- knowledge */

export interface CommandRef {
  label: string;
  command: string;
}

export interface KbTeaser {
  title: string;
  subtitle: string;
  tag: string;
}

export interface KbSection {
  heading: string;
  body: string;
}

export interface KbArticle {
  title: string;
  tag: string;
  /** What in the surveyed estate this article is attached to. */
  related: string;
  lead: string;
  sections: KbSection[];
  commands: CommandRef[];
}

export interface ConfigGuide {
  note: string;
  steps: string[];
  commands: CommandRef[];
}
