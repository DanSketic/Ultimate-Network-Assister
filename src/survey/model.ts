/*
 * Mirrors the Rust collector types (src-tauri/src/collect/).
 *
 * These are raw measurements: exactly what the API returned, normalised but
 * not interpreted. Turning them into an estate — and deciding what is measured
 * versus inferred — happens in mapping.ts.
 */

export type ProfileKind = 'proxmox' | 'unifi' | 'ssh';

/** Which system an ssh profile lands on, so the command catalogue can filter. */
export type SshFlavour = 'proxmox' | 'unifi' | 'other';

/**
 * A saved way to reach one system.
 *
 * One profile is one machine, not one protocol: a Proxmox host reached over
 * both the API and SSH is a single entry carrying both.
 */
export interface Profile {
  id: string;
  kind: ProfileKind;
  label: string;
  /** Origin only, e.g. https://10.0.1.10:8006. Empty for ssh-only profiles. */
  baseUrl: string;
  /** Proxmox: API token id (`user@realm!name`). UniFi: username. */
  username: string;
  /** UniFi site name. */
  site: string;
  /** Pinned leaf certificate for the https endpoint. Null until accepted. */
  fingerprint: string | null;

  /** True when this system is also reachable over ssh. */
  sshEnabled: boolean;
  /** Host name or address, no scheme. */
  sshHost: string;
  /** 0 means the default 22. */
  sshPort: number;
  sshUsername: string;
  sshAuthMethod: 'password' | 'key' | '';
  /** Pinned host key. Null until accepted. */
  sshFingerprint: string | null;
  /**
   * Only for `kind === 'ssh'`: which command catalogue to offer. For the other
   * kinds the answer is the kind itself — see `flavourOf`.
   */
  flavour: SshFlavour | '';

  createdAt: string;
  lastRun: string | null;
}

/** Which command catalogue a profile's ssh session should offer. */
export function flavourOf(profile: Profile): SshFlavour {
  if (profile.kind === 'proxmox' || profile.kind === 'unifi') return profile.kind;
  return profile.flavour || 'other';
}

/* -------------------------------------------------------------------- ssh */

export interface HostKeyProbe {
  reachable: boolean;
  fingerprint: string;
  fingerprintDisplay: string;
  /** The host presented a different key than the pinned one. */
  changed: boolean;
  keyType: string;
  message: string;
}

/**
 * What the application is allowed to do with a command.
 *
 * `forbidden` is not a permission the user can grant: destructive storage and
 * availability commands are never run by the application, only shown.
 */
export type Clearance = 'readOnly' | 'mutating' | 'forbidden';

export interface CommandOutput {
  command: string;
  /**
   * What was actually sent to the far end.
   *
   * Differs from `command` by a `PATH` assignment that reaches the
   * administrative binaries. Shown when it differs, because a "command not
   * found" cannot be diagnosed while the interface shows one string and the
   * machine ran another — and because reading it back is the only way to tell
   * a build carrying the prefix from one that predates it.
   */
  executed?: string;
  clearance: Clearance;
  stdout: string;
  stderr: string;
  exitStatus: number | null;
  /** Output hit the capture cap, or the command outran its timeout. */
  truncated: boolean;
  durationMs: number;
  ranAt: string;
}

export interface EndpointProbe {
  reachable: boolean;
  fingerprint: string;
  fingerprintDisplay: string;
  /** The endpoint presented a different certificate than the pinned one. */
  changed: boolean;
  message: string;
}

export interface LogEntry {
  time: string;
  source: string;
  message: string;
  ok: boolean;
}

/* --------------------------------------------------------------- Proxmox */

export interface PveNode {
  name: string;
  status: string;
  cpuRatio: number;
  cpuCount: number;
  memUsed: number;
  memTotal: number;
  uptimeSecs: number;
}

export interface PveStorage {
  node: string;
  name: string;
  kind: string;
  total: number;
  used: number;
  available: number;
  enabled: boolean;
  /** Comma-separated content types, e.g. "images,rootdir,backup". */
  content: string;
  /** Whether the store is currently mounted and answering. */
  active: boolean;
}

/**
 * Whether a store is allowed to hold backups.
 *
 * Matches whole content types rather than a substring, and tolerates the field
 * being absent: these snapshots are stored as JSON and read back by later
 * builds, so a shape written before a field existed has to stay readable.
 */
export function takesBackups(storage: PveStorage): boolean {
  return (storage.content ?? '').split(',').some((c) => c.trim() === 'backup');
}

export interface PveGuest {
  vmid: number;
  name: string;
  kind: 'qemu' | 'lxc' | string;
  node: string;
  status: string;
  cpuCount: number;
  memTotal: number;
  diskTotal: number;
  tags: string;
}

export interface PveInterface {
  node: string;
  name: string;
  kind: string;
  address: string | null;
  cidr: string | null;
  bridgePorts: string | null;
  vlanAware: boolean;
  active: boolean;
}

export interface PveDisk {
  node: string;
  devpath: string;
  model: string;
  serial: string;
  size: number;
  health: string;
  usedBy: string;
}

export interface ProxmoxSnapshot {
  version: string;
  nodes: PveNode[];
  storages: PveStorage[];
  guests: PveGuest[];
  interfaces: PveInterface[];
  disks: PveDisk[];
  backupJobs: PveBackupJob[];
  backupFiles: PveBackupFile[];
  certificates: PveCertificate[];
  updates: PveUpdate[];
  /**
   * Whether the node let us list updates at all.
   *
   * "Nothing is pending" and "we were not allowed to look" are different facts,
   * and only the first is reassuring.
   */
  updatesReadable: boolean;
}

/** A certificate the node serves, and when it stops being valid. */
export interface PveCertificate {
  node: string;
  filename: string;
  subject: string;
  issuer: string;
  /** Unix seconds; 0 when the node did not say. */
  notAfter: number;
  fingerprint: string;
}

/** A package with a newer version available. */
export interface PveUpdate {
  node: string;
  package: string;
  current: string;
  candidate: string;
  /** "important" marks the security and stability ones. */
  priority: string;
  title: string;
}

/**
 * A scheduled backup job, as configured.
 *
 * A job existing is not evidence that it runs. That comes from the files it
 * left behind, which is why both are collected and compared.
 */
export interface PveBackupJob {
  id: string;
  enabled: boolean;
  schedule: string;
  storage: string;
  /** "all", or a comma-separated vmid list. */
  selection: string;
  exclude: string;
  mode: string;
  retention: string;
  /** Unix seconds; 0 when the controller did not say. */
  nextRun: number;
  mailNotification: string;
  comment: string;
}

export interface PveBackupFile {
  storage: string;
  node: string;
  volid: string;
  vmid: number;
  /** Unix seconds. */
  ctime: number;
  size: number;
  protected: boolean;
  /**
   * "ok" / "failed" / empty. Only a Proxmox Backup Server store verifies; on a
   * plain vzdump target this stays empty, which is itself worth reporting.
   */
  verification: string;
  notes: string;
}

/* ------------------------------------------------------------------ UniFi */

export interface UnifiDevice {
  mac: string;
  name: string;
  model: string;
  kind: string;
  /** 1 = connected; 0 = offline. */
  state: number;
  ip: string;
  version: string;
  uptimeSecs: number;
  clients: number;
  uplinkMac: string;
  /**
   * Which port of the parent this device hangs off, as the device itself
   * reports it. A second measured source for the same fact as LLDP, and often
   * the only one — plenty of hardware does not announce itself.
   */
  uplinkRemotePort: number;
  /** The local port carrying that uplink. */
  uplinkLocalPort: number;
  /** Physical ports, where the device has any. Empty for access points. */
  ports: UnifiPort[];
  /** Radios, where the device has any. Empty for switches and gateways. */
  radios: UnifiRadio[];
}

/**
 * One radio on an access point.
 *
 * Channel utilisation is the number worth having: the share of airtime the
 * radio observed as busy, other people's networks included. That is exactly
 * what a channel choice has to account for and exactly what nobody can see by
 * looking at their own equipment.
 *
 * Measurements the controller did not report come back as -1, not 0 — a radio
 * that said nothing is a different thing from one that measured an idle
 * channel, and only the second is worth acting on.
 */
export interface UnifiRadio {
  name: string;
  /** "ng" for 2.4 GHz, "na" for 5 GHz, "6e" for 6 GHz. */
  band: string;
  channel: string;
  /** Channel width in MHz, as configured. */
  width: number;
  txPowerMode: string;
  txPower: number;
  utilisation: number;
  selfUtilisation: number;
  clients: number;
  satisfaction: number;
}

/**
 * One physical port as the controller reports it.
 *
 * The neighbour fields are empty when the far end does not speak LLDP. That is
 * not the same as an empty port, and the interface distinguishes the two.
 */
export interface UnifiPort {
  /** 1-based, as printed on the case. */
  idx: number;
  name: string;
  up: boolean;
  enabled: boolean;
  /** Negotiated speed in Mbit/s; 0 when down. */
  speed: number;
  fullDuplex: boolean;
  poeEnabled: boolean;
  poePower: string;
  portConfId: string;
  /** "all", "disabled" or a tagged-VLAN group name. */
  taggedVlanMgmt: string;
  neighbourMac: string;
  neighbourName: string;
  neighbourPort: string;
  isUplink: boolean;
}

export interface UnifiNetwork {
  id: string;
  name: string;
  vlan: number | null;
  subnet: string;
  purpose: string;
  enabled: boolean;
  dhcpEnabled: boolean;
}

export interface UnifiWlan {
  id: string;
  name: string;
  enabled: boolean;
  security: string;
  networkId: string;
  isGuest: boolean;
  ppskCount: number;
}

export interface UnifiRule {
  id: string;
  name: string;
  action: string;
  ruleset: string;
  index: number;
  enabled: boolean;
  protocol: string;
  dstPort: string;
  src: string;
  dst: string;
  logging: boolean;
}

export interface UnifiClient {
  mac: string;
  hostname: string;
  ip: string;
  network: string;
  vlan: number | null;
  wired: boolean;
  apMac: string;
  oui: string;
  /**
   * For a wired client: the switch it is plugged into, and which port.
   *
   * The third measured source for what is on a port, and the only one that
   * works for equipment the controller does not manage. A Proxmox host is not a
   * UniFi device, so it has no uplink report, and a stock install does not
   * announce itself over LLDP — but the controller still learned its MAC on a
   * port, and says so here.
   */
  switchMac: string;
  switchPort: number;
}

export interface UnifiSnapshot {
  site: string;
  devices: UnifiDevice[];
  networks: UnifiNetwork[];
  wlans: UnifiWlan[];
  firewallRules: UnifiRule[];
  clients: UnifiClient[];
  portProfiles: UnifiPortProfile[];
  /**
   * `iptables-save` from the gateway, verbatim — the ruleset in force.
   *
   * Everything else here came from the controller and records an intention.
   * This came from the machine enforcing it, and is the only thing in the
   * survey that can turn a configured rule into a verified one.
   *
   * Optional because a snapshot written before this existed, or taken from a
   * profile without ssh, simply has no such text — and both are ordinary.
   */
  liveFirewall?: string;
  /**
   * The same for IPv6, and `ip -br addr` to interpret it.
   *
   * An IPv6 table with no zone rules means either that the family is not
   * filtered or that it is not carried, which are opposite conclusions about
   * whether an IPv4 block is a block. Only a routable address on the interface
   * tells them apart, so the addresses are measured rather than assumed.
   */
  liveFirewallV6?: string;
  liveAddresses?: string;
}

/**
 * A port profile as the controller has it.
 *
 * Collected because the apply layer writes these, and a dry run that cannot see
 * the current value can only ever offer to create — never to leave alone.
 */
export interface UnifiPortProfile {
  id: string;
  name: string;
  /** "all", "native", "customize" or "disabled". */
  forward: string;
  /** Network id of the untagged network; meaningless outside the site. */
  nativeNetworkId: string;
  taggedVlans: number[];
  poeMode: string;
  /** True for the profiles UniFi ships and will not let anyone change. */
  builtin: boolean;
}

/* --------------------------------------------------------------- snapshot */

/**
 * Enough about a kept survey to choose between them.
 *
 * Deliberately not the survey itself: a real estate's snapshot is a large
 * document, and a picker that loaded every one of them would get slower the
 * longer the history is kept.
 */
export interface SnapshotHeader {
  id: string;
  startedAt: string;
  finishedAt: string;
  devices: number;
  guests: number;
  errors: number;
}

export interface SurveySnapshot {
  id: string;
  startedAt: string;
  finishedAt: string;
  log: LogEntry[];
  errors: string[];
  proxmox: ProxmoxSnapshot | null;
  unifi: UnifiSnapshot | null;
}
