import type { Dict } from '@/i18n';
import { takesBackups, type Profile, type SurveySnapshot } from '@/survey/model';
import { importPortsFromSurvey } from './importPorts';
import type {
  Blueprint,
  BlueprintPreset,
  Household,
  InterviewAnswers,
  InterviewService,
  Plan,
  PortAssignment,
  ResolvedBlueprint,
} from './model';
import { buildPlan } from './plan';
import { addHousehold, createBlueprint, resolveBlueprint, slugify, withDefaults } from './resolve';

/*
 * From what somebody said about their home to a blueprint.
 *
 * The planner asks for the estate in its own vocabulary — modules, VLAN ids,
 * address plans — and that is right for the person who has one in mind. The
 * person the guided path is for has a house, some equipment and a wish, and
 * no idea which of thirty chapters that is. So the questions are about the
 * house, the answers pick the preset, the modules and the parameters, and
 * everything the survey already measured is used as the starting value rather
 * than asked for: the Wi-Fi names in use, the address range, the store the
 * server keeps its machines on.
 *
 * Nothing here invents a fact. Where the survey did not measure something,
 * the preset's own default stands, and the planner is where to change it.
 *
 * Pure, like resolve and plan: the same answers and the same survey always
 * produce the same blueprint, so the preview on screen is the thing that gets
 * saved.
 */

/** The preset for a home with a UniFi network, with or without a server. */
export const HOME_PRESET = 'multi-household-proxmox-unifi';
/** The preset for a server on a network nobody is going to re-plan. */
export const HOST_PRESET = 'proxmox-host';

/** What the survey says, for the questions' starting values. */
export interface SurveyFacts {
  hasUnifi: boolean;
  hasProxmox: boolean;
  /** First two octets of the range the estate runs on today, e.g. "192.168". */
  prefix: string | null;
  /** On a flat network: the third octet, and the server's own last one. */
  lanThird: number | null;
  hostByte: number | null;
  hostName: string | null;
  /** The store a running server keeps its machines on. */
  guestStore: string | null;
  /** A store the server is allowed to put backups on. */
  backupStore: string | null;
  /** The Wi-Fi names in use: keeping them means nobody reconnects anything. */
  wifiName: string | null;
  guestWifiName: string | null;
  /** Services that look already to be running, with the machine they run on. */
  running: Partial<Record<InterviewService, string>>;
}

const PREFIX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})/;

/**
 * What a machine's name suggests it runs.
 *
 * A guess, and used only as one: it never ticks a box, it only says "this
 * looks already to be running" next to the box, so nobody builds a second
 * Home Assistant beside the one they forgot they had.
 */
const LOOKS_LIKE: [InterviewService, RegExp][] = [
  ['home-assistant', /home.?assistant|haos|\bhass\b/i],
  ['adguard', /adguard|pi-?hole/i],
  ['media', /plex|jellyfin|emby|media/i],
  ['nextcloud', /nextcloud/i],
  ['windows', /windows|\bwin1[01]\b/i],
];

export function surveyFacts(snapshot: SurveySnapshot | null, profiles: Profile[]): SurveyFacts {
  const unifi = snapshot?.unifi ?? null;
  const pve = snapshot?.proxmox ?? null;

  // The untagged network first: it is the one every stock controller has and
  // the one the estate's addressing was chosen around.
  const lan =
    unifi?.networks.find((n) => n.vlan === null && n.purpose !== 'wan' && PREFIX.test(n.subnet)) ??
    unifi?.networks.find((n) => n.purpose !== 'wan' && PREFIX.test(n.subnet));

  // The server's own address, from the bridge the installer made.
  const iface =
    pve?.interfaces.find((i) => i.name === 'vmbr0' && (i.address || i.cidr)) ??
    pve?.interfaces.find((i) => i.address || i.cidr);
  const hostMatch = PREFIX.exec(iface?.address || iface?.cidr || '');

  const lanMatch = PREFIX.exec(lan?.subnet ?? '');
  const prefix = lanMatch
    ? `${lanMatch[1]}.${lanMatch[2]}`
    : hostMatch
      ? `${hostMatch[1]}.${hostMatch[2]}`
      : null;

  const images = (pve?.storages ?? []).filter(
    (s) =>
      s.enabled &&
      s.active &&
      (s.content ?? '').split(',').some((c) => c.trim() === 'images'),
  );
  // A pool built for machines over a directory that merely allows them.
  const guestStore =
    images.find((s) => /zfs|lvmthin|rbd/i.test(s.kind))?.name ?? images[0]?.name ?? null;
  const backupStore = (pve?.storages ?? []).find((s) => s.enabled && takesBackups(s))?.name ?? null;

  const wlans = (unifi?.wlans ?? []).filter((w) => w.enabled);

  const running: Partial<Record<InterviewService, string>> = {};
  for (const g of pve?.guests ?? []) {
    for (const [service, pattern] of LOOKS_LIKE) {
      if (!running[service] && pattern.test(g.name)) {
        running[service] = `${g.name} (${g.kind === 'lxc' ? 'LXC' : 'VM'} ${g.vmid})`;
      }
    }
  }

  return {
    hasUnifi: unifi !== null || profiles.some((p) => p.kind === 'unifi' && p.fingerprint),
    hasProxmox: pve !== null || profiles.some((p) => p.kind === 'proxmox' && p.fingerprint),
    prefix,
    lanThird: hostMatch ? Number(hostMatch[3]) : null,
    hostByte: hostMatch ? Number(hostMatch[4]) : null,
    hostName: pve?.nodes[0]?.name ?? null,
    guestStore,
    backupStore,
    wifiName: wlans.find((w) => !w.isGuest)?.name ?? null,
    guestWifiName: wlans.find((w) => w.isGuest)?.name ?? null,
    running,
  };
}

/** Which preset the answers are asked against. */
export function presetIdFor(facts: SurveyFacts): string {
  // A network to plan wins; with only a server there is none to plan. With
  // neither — the browser preview — the home is the one worth showing.
  return facts.hasUnifi || !facts.hasProxmox ? HOME_PRESET : HOST_PRESET;
}

/** The services a preset can build, in the order they are offered. */
export function servicesFor(presetId: string): InterviewService[] {
  return presetId === HOST_PRESET
    ? ['home-assistant', 'adguard', 'nextcloud']
    : ['home-assistant', 'adguard', 'media', 'nextcloud', 'windows'];
}

export function defaultAnswers(facts: SurveyFacts, t: Dict): InterviewAnswers {
  const x = t.guided.want;
  return {
    homes: 'one',
    homeNames: [],
    cameras: false,
    cameraCount: 4,
    sharedPrinter: false,
    server: facts.hasProxmox ? 'existing' : 'none',
    // Nothing ticked on anybody's behalf: a machine is an evening's work, and
    // "the survey saw one like it" is a reason to say so, not to build another.
    services: [],
    remote: 'none',
    wifiName: facts.wifiName ?? x.defaultWifi,
    guestWifiName: facts.guestWifiName ?? x.defaultGuestWifi,
  };
}

/** An SSID the controller will take: at most 32 bytes. */
function ssid(name: string): string {
  let out = name.trim();
  while (new TextEncoder().encode(out).length > 32) out = out.slice(0, -1);
  return out;
}

/** Moves an address onto the estate's own range, keeping its last octets. */
function onPrefix(address: string, prefix: string): string {
  return address.replace(/^\d{1,3}\.\d{1,3}\./, `${prefix}.`);
}

const SERVICE_MODULES: Record<string, Record<InterviewService, string[]>> = {
  [HOME_PRESET]: {
    'home-assistant': ['home-assistant'],
    adguard: ['adguard'],
    media: ['media-docker', 'media-stack'],
    nextcloud: ['nextcloud'],
    windows: ['windows-rdp'],
  },
  [HOST_PRESET]: {
    'home-assistant': ['home-assistant'],
    adguard: ['adguard'],
    media: [],
    nextcloud: ['docker-host', 'nextcloud'],
    windows: [],
  },
};

/** The modules of the server itself, in both presets. */
const SERVER_BASE = ['pve-base', 'disk-validation', 'storage', 'resources', 'vm-template', 'boot-order', 'updates'];
/** Chapters that only mean something while the machine is still in pieces. */
const SERVER_NEW = ['hardware-state', 'physical', 'bios'];

/** Households named in the answers, with VLANs continuing the preset's numbering. */
function householdsFor(answers: InterviewAnswers, bp: Blueprint, preset: BlueprintPreset, t: Dict): Household[] {
  const x = t.guided.want;
  const names =
    answers.homes === 'several'
      ? answers.homeNames.map((n) => n.trim()).filter(Boolean)
      : [x.homeDefault];
  // Two households are the least that "several" means; blank rows are filled
  // rather than left to produce a plan with one household and a warning.
  while (answers.homes === 'several' && names.length < 2) names.push(x.homeNumbered(names.length + 1));

  const out: Household[] = [];
  const slugs = new Set<string>();
  for (const [i, name] of names.entries()) {
    const draft = addHousehold({ ...bp, households: out }, preset, name);
    // Two names can slug the same, and a slug is half of a network's name.
    let slug = draft.slug || `H${i + 1}`;
    if (slugs.has(slug)) slug = `${slug}${i + 1}`;
    slugs.add(slug);
    out.push({ ...draft, slug, id: `${slug.toLowerCase()}-${i + 1}` });
  }
  return out;
}

export interface InterviewResult {
  blueprint: Blueprint;
  resolved: ResolvedBlueprint;
  plan: Plan;
  /** Networks the controller has today that the plan does not describe. They are left as they are. */
  untouched: { name: string; subnet: string }[];
  /**
   * Machines the survey saw on a network the plan has no counterpart for —
   * the controller's default LAN, nearly always — that the answers placed on
   * the household's own network. Said out loud, because it is a decision.
   */
  placed: PortAssignment[];
  /** Access ports still on no network the plan has: the question to ask. */
  orphans: PortAssignment[];
}

/**
 * The blueprint the answers describe, resolved and planned.
 *
 * `base` is the blueprint being re-answered, when there is one: its id and its
 * port layout are kept, so answering again edits the same plan rather than
 * starting a second, and a label somebody typed onto a port survives.
 */
export function blueprintFromAnswers(input: {
  answers: InterviewAnswers;
  facts: SurveyFacts;
  presets: BlueprintPreset[];
  snapshot: SurveySnapshot | null;
  t: Dict;
  base?: Blueprint;
  /** Networks chosen for particular ports, by port id. */
  portNetworks?: Record<string, number>;
  now?: Date;
}): InterviewResult | null {
  const { answers, facts, presets, snapshot, t, base } = input;
  const portNetworks = input.portNetworks ?? {};
  const presetId = presetIdFor(facts);
  const preset = presets.find((p) => p.id === presetId);
  if (!preset) return null;

  const now = input.now ?? new Date();
  const stamp = now.toISOString();
  const bp = createBlueprint(preset, t.guided.want.blueprintName, now);
  if (base) {
    bp.id = base.id;
    bp.createdAt = base.createdAt;
  }
  bp.description = t.guided.want.blueprintDescription;

  /* ---- modules ---- */

  const enabled = new Set(preset.modules.filter((m) => !m.optional).map((m) => m.id));
  const server = answers.server !== 'none';
  if (server) {
    for (const id of SERVER_BASE) enabled.add(id);
    if (answers.server === 'new') for (const id of SERVER_NEW) enabled.add(id);
    const offered = servicesFor(presetId);
    for (const s of answers.services) {
      if (!offered.includes(s)) continue;
      for (const id of SERVICE_MODULES[presetId]?.[s] ?? []) enabled.add(id);
    }
  }
  if (presetId === HOME_PRESET) {
    enabled.add('gateway-hardening');
    // The server's VLANs arrive on a trunk; without a server there is no trunk.
    if (server) enabled.add('pve-bridges');
    if (answers.cameras) enabled.add('cameras');
    if (answers.homes === 'several' && answers.sharedPrinter) enabled.add('shared-printer');
    if (server && answers.remote === 'tunnel') enabled.add('cloudflare-tunnel');
  }
  // Preset order is handbook order, and only modules the preset has.
  bp.enabledModules = preset.modules.filter((m) => enabled.has(m.id)).map((m) => m.id);

  /* ---- parameters ---- */

  const params = withDefaults(preset, {});
  const prefix = facts.prefix && /^\d{1,3}\.\d{1,3}$/.test(facts.prefix) ? facts.prefix : null;

  if (presetId === HOME_PRESET) {
    if (prefix) {
      params['ipPrefix'] = prefix;
      // The preset's fixed addresses are written against its own range.
      for (const def of preset.params) {
        if (def.type === 'ipv4') params[def.id] = onPrefix(String(params[def.id]), prefix);
      }
    }
    params['layout'] = answers.homes === 'several' ? 'floorsIsolated' : 'single';
    // One guest network for the house is what a guest needs; a second one
    // building-wide beside it is the handbook's estate, not this one.
    params['guestScope'] = 'shared';
    params['sharedGuestVlan'] = 0;
    params['ssidMain'] = ssid(answers.wifiName);
    params['ssidGuest'] = ssid(answers.guestWifiName);
    params['ssidIot'] = ssid(`${answers.wifiName.trim()}-IoT`);
    params['ssidCast'] = ssid(`${answers.wifiName.trim()}-Cast`);
    params['cameraCount'] = Math.max(1, Math.min(64, Math.round(answers.cameraCount) || 1));
  } else {
    if (prefix) params['ipPrefix'] = prefix;
    if (facts.lanThird !== null) params['lanThird'] = facts.lanThird;
    if (facts.hostByte !== null) params['hostByte'] = facts.hostByte;
    if (facts.hostName) params['hostName'] = facts.hostName;
    const lan = `${String(params['ipPrefix'])}.${String(params['lanThird'])}`;
    for (const def of preset.params) {
      if (def.type === 'ipv4') {
        params[def.id] = String(params[def.id]).replace(/^\d{1,3}\.\d{1,3}\.\d{1,3}\./, `${lan}.`);
      }
    }
    if (facts.backupStore) params['backupStorage'] = facts.backupStore;
  }

  if (answers.server === 'existing') {
    params['storageMode'] = 'existing';
    params['fastPoolName'] = facts.guestStore ?? 'local-lvm';
    if ('dataPool' in params) params['dataPool'] = false;
  } else {
    params['storageMode'] = 'build';
  }
  bp.params = params;

  /* ---- households ---- */

  if (preset.householdsEditable) bp.households = householdsFor(answers, bp, preset, t);

  /* ---- ports, from the survey ---- */

  /*
   * What is plugged in where is a fact about the building, and the survey has
   * measured it. Resolved once without ports to learn the networks, then the
   * port table is read against them — merged into the layout being
   * re-answered, so anything typed onto a port by hand stays.
   */
  const first = resolveBlueprint(bp, preset, t);
  if (snapshot?.unifi) {
    bp.ports = importPortsFromSurvey(snapshot, base?.ports ?? [], first.networks).ports;
  } else if (base) {
    bp.ports = base.ports;
  }

  /*
   * Where the machines on the old default LAN go.
   *
   * The import places a port on a planned network only where the network it
   * was measured on is one the plan has. The controller's default LAN never
   * is — it has no VLAN, and the plan numbers everything — so every wired
   * machine on a stock estate arrived as an access port with no network, and
   * the plan could not be saved until someone who does not know what an
   * access port is had fixed eight of them.
   *
   * With one household the answer is not in doubt: its own network is where
   * its computers and televisions belong. With several it is exactly the
   * question the plan cannot answer alone, so it is asked — see `orphans`.
   * Either way a choice made for a port wins.
   */
  bp.ports = bp.ports.map((p) =>
    portNetworks[p.id] !== undefined && p.role === 'access'
      ? { ...p, nativeVlan: portNetworks[p.id] ?? 0 }
      : p,
  );
  const placed: PortAssignment[] = [];
  const home = bp.households[0]?.clientVlan ?? 0;
  if (presetId === HOME_PRESET && answers.homes === 'one' && home > 0) {
    bp.ports = bp.ports.map((p) => {
      if (p.role !== 'access' || p.nativeVlan) return p;
      const moved = { ...p, nativeVlan: home };
      placed.push(moved);
      return moved;
    });
  }

  bp.interview = { answers, answeredAt: stamp };
  // Equal to the answer time, so an edit made later in the planner is
  // visible as one: `updatedAt` moves and `answeredAt` does not.
  bp.updatedAt = stamp;
  bp.source = 'user';

  const resolved = resolveBlueprint(bp, preset, t);
  const plan = buildPlan(resolved, t);

  const planned = new Set(resolved.networks.map((n) => n.vlan));
  const untouched = (snapshot?.unifi?.networks ?? [])
    .filter((n) => n.purpose !== 'wan' && !planned.has(n.vlan ?? 0))
    .map((n) => ({ name: n.name, subnet: n.subnet }));

  const vlansPlanned = new Set(resolved.networks.map((n) => n.vlan));
  const orphans = bp.ports.filter((p) => p.role === 'access' && !vlansPlanned.has(p.nativeVlan));

  return { blueprint: bp, resolved, plan, untouched, placed, orphans };
}

/** Whether a guided blueprint has been changed in the planner since it was answered. */
export function editedSinceAnswered(bp: Blueprint): boolean {
  return bp.interview !== undefined && bp.updatedAt !== bp.interview.answeredAt;
}

/** The blueprint the guided path works on: the one most recently answered for. */
export function guidedBlueprint(blueprints: Blueprint[]): Blueprint | undefined {
  return blueprints
    .filter((b) => b.interview !== undefined)
    .sort((a, b) => (b.interview!.answeredAt < a.interview!.answeredAt ? -1 : 1))[0];
}

/** Household ids stay out of what a person reads; this is for the preview. */
export const householdSlug = slugify;
