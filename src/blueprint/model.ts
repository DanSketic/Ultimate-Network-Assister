/*
 * Blueprint domain.
 *
 * A blueprint is a *declarative* description of a target estate — what the
 * network and the server should look like when the work is done. It is not a
 * script and not a survey: it carries no live state.
 *
 * The pipeline is:
 *
 *   Blueprint  --resolve-->  ResolvedBlueprint  --plan-->  Plan  --render-->  guide
 *
 * `resolve` expands parameters and household groups into concrete VLANs, SSIDs,
 * zones and guests; `plan` turns that target state into ordered, executable
 * steps. Both are pure functions, so the same blueprint always produces the
 * same plan and the same exported handbook.
 */

/** Systems a blueprint can describe. */
export type TargetPlatform = 'unifi' | 'proxmox' | 'docker' | 'kubernetes' | 'host';

export type RiskLevel = 'low' | 'medium' | 'high';

/* ------------------------------------------------------------- parameters */

export type ParamType = 'text' | 'number' | 'boolean' | 'enum' | 'cidr' | 'ipv4' | 'vlan';

export type ParamValue = string | number | boolean;

export interface ParamOption {
  value: string;
  label: string;
}

export interface ParamDef {
  id: string;
  label: string;
  help?: string;
  type: ParamType;
  default: ParamValue;
  /** Enum choices. */
  options?: ParamOption[];
  min?: number;
  max?: number;
  unit?: string;
  /** Form section this parameter belongs to. */
  group: string;
  /** Only shown when the owning module is enabled. */
  moduleId?: string;
}

export type ParamValues = Record<string, ParamValue>;

/* -------------------------------------------------------------- households */

/**
 * A household is the repeating unit of a multi-tenant home: one family gets a
 * client VLAN, an IoT VLAN and a guest VLAN, and may not reach any other
 * household. Adding or removing one is the main axis of variation, which is
 * why it is a first-class list rather than a parameter.
 */
export interface Household {
  id: string;
  /** Display name, e.g. "Pince". */
  name: string;
  /** Uppercase slug used in VLAN and zone names, e.g. "PINCE". */
  slug: string;
  clientVlan: number;
  iotVlan: number;
  guestVlan: number;
}

/* ----------------------------------------------------------------- modules */

export type ModuleGroup = 'overview' | 'network' | 'server' | 'services' | 'ops';

export interface BlueprintModule {
  id: string;
  /** Chapter number in the exported handbook, e.g. "10A". */
  code: string;
  title: string;
  group: ModuleGroup;
  summary: string;
  targets: TargetPlatform[];
  risk: RiskLevel;
  /** Rough hands-on time, in minutes. */
  minutes: number;
  /** false for the modules that define the estate and cannot be dropped. */
  optional: boolean;
  /**
   * Left switched off when a blueprint is created from the preset.
   *
   * The default everywhere else is that a preset describes a whole estate and
   * switching a part off is the deliberate act. This is for the chapters where
   * that reads backwards: a module that only applies to a case the preset does
   * not assume — VLANs on a host whose network is flat — would otherwise put a
   * plan in front of someone that they have to notice and undo. Only ever set
   * together with `optional`, since a required module is switched on anyway.
   */
  defaultOff?: boolean;
  /** Module ids that must also be enabled. */
  requires?: string[];
  /** Modules that cannot be enabled at the same time. */
  conflictsWith?: string[];
}

/* --------------------------------------------------------------- blueprint */

export interface Blueprint {
  id: string;
  name: string;
  description: string;
  /** Presets ship with the app and are copied before editing. */
  source: 'preset' | 'user';
  /** Blueprint definition this instance was created from. */
  presetId: string;
  targets: TargetPlatform[];
  households: Household[];
  params: ParamValues;
  enabledModules: string[];
  /** What is plugged into which switch port. Empty until the user says. */
  ports: PortAssignment[];
  createdAt: string;
  updatedAt: string;
}

/**
 * What a port is for.
 *
 * The role is the whole point: from it and the planned networks, the VLANs a
 * port must pass follow. Typing tagged VLAN lists by hand is exactly how a
 * trunk ends up missing one network and an access point stops handing out an
 * SSID for reasons nobody can find.
 */
export type PortRole = 'access' | 'ap' | 'server' | 'trunk' | 'uplink' | 'off';

/** One port, as the user describes it. Plain data — no VLANs decided here. */
export interface PortAssignment {
  id: string;
  /** Switch this port is on, by the name the survey reports. */
  device: string;
  /** 1-based, as printed on the case. */
  idx: number;
  /** What is plugged in, in the user's words. */
  label: string;
  role: PortRole;
  /** Access ports only: which planned network is untagged here. */
  nativeVlan: number;
  poe: boolean;
}

/**
 * The reusable half of a blueprint: everything that is the same for every
 * instance. A `Blueprint` only stores the choices made against it.
 */
export interface BlueprintPreset {
  id: string;
  name: string;
  description: string;
  targets: TargetPlatform[];
  modules: BlueprintModule[];
  params: ParamDef[];
  /** Household defaults; an empty list means the preset is single-tenant. */
  households: Household[];
  /** Whether households can be added or removed. */
  householdsEditable: boolean;
  /** VLAN offsets applied to a household's index when adding a new one. */
  householdVlanBase?: { client: number; iot: number; guest: number };
  /** Builds the target state. Called by `resolve`. */
  build: (ctx: BuildContext) => BuildResult;
}

export interface BuildContext {
  params: ParamValues;
  households: Household[];
  /** Module ids that are enabled for this instance. */
  enabled: Set<string>;
  /** Reads a parameter, falling back to the preset default. */
  num: (id: string) => number;
  str: (id: string) => string;
  bool: (id: string) => boolean;
}

/* ------------------------------------------------------------ target state */

export type NetworkRole =
  | 'management'
  | 'trusted'
  | 'infra'
  | 'printers'
  | 'dmz'
  | 'vpn'
  | 'rdp'
  | 'media'
  | 'server-test'
  | 'server-prod'
  | 'household'
  | 'iot'
  | 'guest'
  /** Wired cameras. Their own role so an AP trunk does not carry them. */
  | 'cameras';

export interface PlannedNetwork {
  vlan: number;
  name: string;
  cidr: string;
  gateway: string;
  role: NetworkRole;
  purpose: string;
  /** Household id, when this network belongs to one. */
  householdId?: string;
  /** Module that introduces this network. */
  moduleId: string;
}

export type WifiSecurity = 'wpa2-ppsk' | 'wpa2' | 'wpa3' | 'open';

export interface PpskEntry {
  /** Human label for the key, e.g. "Pince – fő kliensek". */
  label: string;
  vlan: number;
  householdId?: string;
  note?: string;
}

export interface PlannedSsid {
  name: string;
  security: WifiSecurity;
  band: string;
  purpose: string;
  ppsk: PpskEntry[];
  moduleId: string;
}

export interface PlannedZone {
  name: string;
  purpose: string;
  /** VLANs that belong to the zone. */
  vlans: number[];
  householdId?: string;
  moduleId: string;
}

export interface AddressObject {
  name: string;
  address: string;
  purpose: string;
}

export interface PortObject {
  name: string;
  protocol: 'tcp' | 'udp' | 'tcp/udp';
  ports: string;
  purpose: string;
}

export type PolicyAction = 'allow' | 'block' | 'reject';

export interface PlannedPolicy {
  /** Lower runs first; the resolver keeps specific allows above broad blocks. */
  order: number;
  from: string;
  to: string;
  ports?: string;
  action: PolicyAction;
  log: boolean;
  purpose: string;
  moduleId: string;
}

export type GuestKind = 'vm' | 'lxc';

export interface PlannedGuest {
  vmid: number;
  name: string;
  kind: GuestKind;
  vlan: number;
  vcpu: string;
  ram: string;
  disk: string;
  ip?: string;
  os: string;
  purpose: string;
  moduleId: string;
}

export type StorageKind = 'zfs-mirror' | 'xfs' | 'mergerfs' | 'lvm-thin' | 'directory';

export interface PlannedStorage {
  name: string;
  kind: StorageKind;
  devices: string;
  purpose: string;
  /** Creating this destroys data on the listed devices. */
  destructive: boolean;
  moduleId: string;
}

export interface PlannedService {
  name: string;
  host: string;
  ports: string;
  exposure: 'internal' | 'vpn' | 'public' | 'tunnel';
  purpose: string;
  moduleId: string;
}

export interface BuildResult {
  networks: PlannedNetwork[];
  ssids: PlannedSsid[];
  zones: PlannedZone[];
  addressObjects: AddressObject[];
  portObjects: PortObject[];
  policies: PlannedPolicy[];
  guests: PlannedGuest[];
  storage: PlannedStorage[];
  services: PlannedService[];
}

/**
 * A port with its VLANs worked out.
 *
 * Derived, never typed: `taggedVlans` comes from the role and the planned
 * networks, so adding a household VLAN updates every AP port at once.
 */
export interface PlannedPort {
  device: string;
  idx: number;
  label: string;
  role: PortRole;
  /** Untagged VLAN; 0 means "leave the controller's default". */
  nativeVlan: number;
  /** VLANs that must pass tagged. Empty on an access port. */
  taggedVlans: number[];
  poe: boolean;
  /** Port profile this port should carry. */
  profile: string;
}

/**
 * A named port profile — the object the application can actually write.
 *
 * Profiles are safe to create: they change nothing until a port is pointed at
 * one. Pointing a port at one is not written from here; see the note on
 * `ResolvedBlueprint.ports`.
 */
export interface PlannedPortProfile {
  name: string;
  role: PortRole;
  nativeVlan: number;
  taggedVlans: number[];
  poe: boolean;
  purpose: string;
  /** How many planned ports use it. */
  portCount: number;
}

export interface ValidationIssue {
  severity: 'error' | 'warning';
  message: string;
  /** Where the problem is, for the editor to point at. */
  where?: string;
}

export interface ResolvedBlueprint extends BuildResult {
  blueprint: Blueprint;
  preset: BlueprintPreset;
  /** Modules that survived the enable/require pass, in handbook order. */
  modules: BlueprintModule[];
  issues: ValidationIssue[];
  /**
   * Ports with their VLANs worked out.
   *
   * Note what the apply layer does with these: it writes the *profiles* and
   * not the per-port assignment. Pointing a physical port at a profile is a
   * PUT on the device object, and getting it wrong on the wrong port cuts the
   * controller's own uplink — with no way back from inside the application.
   * The plan carries the exact values instead.
   */
  ports: PlannedPort[];
  portProfiles: PlannedPortProfile[];
}

/* -------------------------------------------------------------------- plan */

/**
 * How far the application may go on a step.
 *
 * - `auto`     the application can apply it through an API, given a dry run,
 *              a verified backup and a recorded rollback path;
 * - `assisted` the application prepares exact values or commands, a person
 *              executes them (UniFi screens with no API, PPSK entry, …);
 * - `manual`   a person must do it, and the application must not offer to.
 *              Destructive storage work lives here permanently.
 */
export type AutomationLevel = 'auto' | 'assisted' | 'manual';

export const AUTOMATION_ORDER: AutomationLevel[] = ['manual', 'assisted', 'auto'];

export type ActionKind = 'command' | 'api' | 'ui';

export interface PlanAction {
  kind: ActionKind;
  label: string;
  /** Shell command, API call description, or the UI path to click. */
  body: string;
  target: TargetPlatform;
  /** Irreversible without a restore. Forces the step to `manual`. */
  destructive: boolean;
}

export interface PlanStep {
  id: string;
  moduleId: string;
  title: string;
  detail: string;
  risk: RiskLevel;
  minutes: number;
  /** The furthest this step may be automated, after the safety policy. */
  capability: AutomationLevel;
  /** Why the capability was capped, when it was. */
  capabilityReason?: string;
  requiresBackup: boolean;
  /** Changing this can cut the remote session; a local console must be proven. */
  requiresLocalConsole: boolean;
  prechecks: string[];
  actions: PlanAction[];
  verification: string[];
}

export interface PlanModule {
  module: BlueprintModule;
  steps: PlanStep[];
  minutes: number;
}

export interface Plan {
  modules: PlanModule[];
  steps: PlanStep[];
  totalMinutes: number;
  counts: Record<AutomationLevel, number>;
  /** Steps that will destroy data if run carelessly. */
  destructiveCount: number;
}
