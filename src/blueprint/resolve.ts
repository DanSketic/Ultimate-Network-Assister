import type {
  Blueprint,
  BlueprintModule,
  BlueprintPreset,
  BuildContext,
  Household,
  ParamValue,
  ParamValues,
  ResolvedBlueprint,
  ValidationIssue,
} from './model';
import type { Dict } from '@/i18n';
import { derivePorts, portIssues } from './ports';

/** The sentences the resolver reports contradictions with. */
type IssueText = Dict['blueprint']['issue'];

/**
 * Turns a blueprint's choices into a concrete target state.
 *
 * Pure: same blueprint in, same target state out. Everything the editor shows
 * and everything the planner and the exporter consume comes from here, so a
 * parameter change is visible everywhere at once.
 */
export function resolveBlueprint(
  blueprint: Blueprint,
  preset: BlueprintPreset,
  t: Dict,
): ResolvedBlueprint {
  const x = t.blueprint.issue;
  const issues: ValidationIssue[] = [];
  const modules = resolveModules(blueprint, preset, issues, x);
  const enabled = new Set(modules.map((m) => m.id));

  const ctx = buildContext(blueprint.params, preset, blueprint.households, enabled);
  const built = preset.build(ctx);

  validate(built, blueprint.households, ctx, issues, preset, x);

  // Ports are derived after the build because their VLAN sets come from the
  // networks it produced — which keeps the rule preset-agnostic.
  const { ports, profiles } = derivePorts(blueprint.ports ?? [], built.networks, t);
  issues.push(...portIssues(ports, built.networks, t));

  return { blueprint, preset, modules, issues, ports, portProfiles: profiles, ...built };
}

/* ----------------------------------------------------------------- modules */

function resolveModules(
  blueprint: Blueprint,
  preset: BlueprintPreset,
  issues: ValidationIssue[],
  x: IssueText,
): BlueprintModule[] {
  const byId = new Map(preset.modules.map((m) => [m.id, m]));
  const requested = new Set(blueprint.enabledModules);

  // Mandatory modules define the estate and are always part of it.
  for (const m of preset.modules) {
    if (!m.optional) requested.add(m.id);
  }

  // Drop anything whose prerequisites are missing, and keep dropping until the
  // set is stable — a dropped module can strand the one that depended on it.
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...requested]) {
      const mod = byId.get(id);
      if (!mod) {
        requested.delete(id);
        issues.push({ severity: 'warning', message: `unknown module: ${id}`, where: id });
        changed = true;
        continue;
      }
      const missing = (mod.requires ?? []).filter((r) => !requested.has(r));
      if (missing.length > 0) {
        requested.delete(id);
        issues.push({
          severity: 'warning',
          message: x.moduleMissingDeps(
            mod.title,
            missing.map((r) => byId.get(r)?.title ?? r).join(', '),
          ),
          where: id,
        });
        changed = true;
      }
    }
  }

  for (const id of requested) {
    const mod = byId.get(id);
    const clash = (mod?.conflictsWith ?? []).filter((c) => requested.has(c));
    if (clash.length > 0) {
      issues.push({
        severity: 'error',
        message: x.moduleClash(mod!.title, clash.map((c) => byId.get(c)?.title ?? c).join(', ')),
        where: id,
      });
    }
  }

  // Preset order is handbook order.
  return preset.modules.filter((m) => requested.has(m.id));
}

/* -------------------------------------------------------------- parameters */

function buildContext(
  values: ParamValues,
  preset: BlueprintPreset,
  households: Household[],
  enabled: Set<string>,
): BuildContext {
  const defaults = new Map(preset.params.map((p) => [p.id, p.default]));

  const read = (id: string): ParamValue => {
    const v = values[id];
    return v !== undefined ? v : (defaults.get(id) ?? '');
  };

  return {
    params: values,
    households,
    enabled,
    num: (id) => {
      const v = read(id);
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) ? n : 0;
    },
    str: (id) => String(read(id)),
    bool: (id) => read(id) === true || read(id) === 'true',
  };
}

/** Fills in every default the blueprint has no explicit value for. */
export function withDefaults(preset: BlueprintPreset, values: ParamValues): ParamValues {
  const out: ParamValues = {};
  for (const p of preset.params) out[p.id] = p.default;
  return { ...out, ...values };
}

/* -------------------------------------------------------------- validation */

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function isIpv4(value: string): boolean {
  const m = IPV4.exec(value.trim());
  if (!m) return false;
  return m.slice(1).every((part) => {
    const n = Number(part);
    return n >= 0 && n <= 255 && String(n) === String(Number(part));
  });
}

function validate(
  built: ReturnType<BlueprintPreset['build']>,
  households: Household[],
  ctx: BuildContext,
  issues: ValidationIssue[],
  preset: BlueprintPreset,
  x: IssueText,
): void {
  const prefix = ctx.str('ipPrefix');

  /* ---- VLAN ids ---- */

  const seenVlan = new Map<number, string>();
  for (const n of built.networks) {
    const previous = seenVlan.get(n.vlan);
    if (previous) {
      issues.push({
        severity: 'error',
        message: x.vlanTwice(n.vlan, previous, n.name),
        where: n.name,
      });
    } else {
      seenVlan.set(n.vlan, n.name);
    }

    // The preset derives the third octet from the VLAN id, which only works
    // while the id fits in one octet.
    if (n.vlan > 254) {
      issues.push({
        severity: 'error',
        message: x.vlanOutOfRange(n.vlan, n.name),
        where: n.name,
      });
    }
  }

  /* ---- household VLANs ---- */

  const householdVlans = new Map<number, string>();
  for (const h of households) {
    for (const [role, vlan] of [
      [x.roleClient, h.clientVlan],
      [x.roleIot, h.iotVlan],
      [x.roleGuest, h.guestVlan],
    ] as const) {
      const previous = householdVlans.get(vlan);
      if (previous) {
        issues.push({
          severity: 'error',
          message: x.vlanClash(vlan, previous, h.name, role),
          where: h.id,
        });
      } else {
        householdVlans.set(vlan, `${h.name} ${role}`);
      }
    }
  }

  // Only meaningful where households are part of the model at all; a cluster
  // blueprint legitimately has none.
  if (preset.householdsEditable && households.length === 0) {
    issues.push({
      severity: 'warning',
      message: x.noHouseholds,
    });
  }

  /* ---- fixed addresses ---- */

  const networkByVlan = new Map(built.networks.map((n) => [n.vlan, n]));
  const seenIp = new Map<string, string>();

  const checkAddress = (label: string, ip: string | undefined, vlan?: number) => {
    if (!ip) return;
    if (!isIpv4(ip)) {
      issues.push({ severity: 'error', message: x.badIp(label, ip), where: label });
      return;
    }
    const previous = seenIp.get(ip);
    if (previous) {
      issues.push({
        severity: 'error',
        message: x.ipTwice(ip, previous, label),
        where: label,
      });
    } else {
      seenIp.set(ip, label);
    }

    if (vlan !== undefined && networkByVlan.has(vlan)) {
      const expected = `${prefix}.${vlan}.`;
      if (!ip.startsWith(expected)) {
        issues.push({
          severity: 'error',
          message: x.ipOutOfSubnet(label, ip, vlan, expected),
          where: label,
        });
      }
    }
  };

  for (const g of built.guests) checkAddress(g.name, g.ip, g.vlan);
  for (const a of built.addressObjects) {
    if (!seenIp.has(a.address)) checkAddress(a.name, a.address);
  }

  /* ---- gateway ---- */

  const gwByte = ctx.num('gatewayHostByte');
  if (gwByte < 1 || gwByte > 254) {
    issues.push({
      severity: 'error',
      message: x.badGatewayByte(gwByte),
      where: 'gatewayHostByte',
    });
  }
  for (const [ip, label] of seenIp) {
    const parts = ip.split('.');
    if (parts.length === 4 && Number(parts[3]) === gwByte) {
      issues.push({
        severity: 'error',
        message: x.ipIsGateway(label, ip),
        where: label,
      });
    }
  }

  /* ---- prefix ---- */

  if (!/^\d{1,3}\.\d{1,3}$/.test(prefix)) {
    issues.push({
      severity: 'error',
      message: x.badPrefix(prefix),
      where: 'ipPrefix',
    });
  }

  /* ---- policy sanity ---- */

  const allowsBelowCatchAll = built.policies.filter((p) => p.action === 'allow');
  const catchAll = built.policies.find((p) => p.order >= 900 && p.action === 'block');
  if (catchAll && allowsBelowCatchAll.some((p) => p.order >= catchAll.order)) {
    issues.push({
      severity: 'error',
      message: x.allowBelowDeny,
    });
  }
}

/* --------------------------------------------------------------- factories */

let counter = 0;

/** Monotonic id; blueprints are created one at a time from the UI. */
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter.toString(36)}${Math.floor(performance.now()).toString(36)}`;
}

export function createBlueprint(preset: BlueprintPreset, name?: string, now = new Date()): Blueprint {
  const stamp = now.toISOString();
  return {
    id: nextId('bp'),
    name: name ?? preset.name,
    description: preset.description,
    source: 'user',
    presetId: preset.id,
    targets: [...preset.targets],
    households: preset.households.map((h) => ({ ...h })),
    params: withDefaults(preset, {}),
    // Everything on by default: the preset describes a complete estate, and
    // switching parts off is the deliberate act. The exception is a module the
    // preset marks as belonging to a case it does not assume.
    enabledModules: preset.modules.filter((m) => !m.defaultOff).map((m) => m.id),
    // Ports start empty: what is plugged in is a fact about the building, not
    // something a preset can know.
    ports: [],
    createdAt: stamp,
    updatedAt: stamp,
  };
}

/** Appends a household, continuing the preset's VLAN numbering. */
export function addHousehold(blueprint: Blueprint, preset: BlueprintPreset, name: string): Household {
  const base = preset.householdVlanBase ?? { client: 10, iot: 71, guest: 91 };
  const used = new Set(
    blueprint.households.flatMap((h) => [h.clientVlan, h.iotVlan, h.guestVlan]),
  );
  const nextFree = (from: number) => {
    let v = from;
    while (used.has(v)) v += 1;
    used.add(v);
    return v;
  };

  const slug = slugify(name);
  return {
    id: `${slug.toLowerCase()}-${blueprint.households.length + 1}`,
    name,
    slug,
    clientVlan: nextFree(base.client + blueprint.households.length),
    iotVlan: nextFree(base.iot + blueprint.households.length),
    guestVlan: nextFree(base.guest + blueprint.households.length),
  };
}

const ACCENTS: Record<string, string> = {
  á: 'a', é: 'e', í: 'i', ó: 'o', ö: 'o', ő: 'o', ú: 'u', ü: 'u', ű: 'u',
};

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[áéíóöőúüű]/g, (c) => ACCENTS[c] ?? c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toUpperCase();
}
