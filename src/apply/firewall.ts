import type { PlannedPolicy, PlannedZone, ResolvedBlueprint } from '@/blueprint/model';
import type { UnifiSnapshot, UnifiZone } from '@/survey/model';
import type { ApplyOperation } from './model';

/*
 * Firewall zones and policies → write operations.
 *
 * This is the part of the target state that was left unwritable from the start,
 * and the reason was never that rules are hard to compose. It is that a wrong
 * one can close the path the correction would have to travel. Three things had
 * to exist before it could be built at all, and all three are here:
 *
 *   The shape is copied, not invented. A controller may accept a request that
 *   omits fields and fill them with defaults nobody chose, and on a deny rule
 *   that is precisely the accident worth fearing. So an object is built by
 *   cloning one this controller already holds — the survey keeps one of each
 *   verbatim — and setting only the fields we own. The keys are read off the
 *   template too, since the releases disagree about `zone_id` and `zoneId`.
 *
 *   Nothing is written where nothing was read. No recorded endpoint, no
 *   template, or no surveyed zones means no operations at all, rather than a
 *   request to a path that seemed likely.
 *
 *   The order is the safety argument. Zones first — a zone is a grouping and
 *   denies nothing — then allows, then blocks, so that the operations which
 *   could close a path are the last ones taken and the first ones checked.
 *
 * What is refused on top of that, and why, lives in `reachability.ts`. This
 * module builds; that one decides.
 */

/** Keys a release might use for the zone id inside a policy endpoint. */
const ZONE_ID_KEYS = ['zone_id', 'zoneId'];
/** Keys a release might use for a zone's membership. */
const NETWORK_IDS_KEYS = ['network_ids', 'networkIds'];

function parseTemplate(text: string | undefined): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** The key an object actually uses, out of the spellings a release might pick. */
function keyUsed(object: Record<string, unknown> | null, candidates: string[]): string | null {
  if (!object) return null;
  return candidates.find((k) => k in object) ?? null;
}

/**
 * A copy of the template with the identifying fields stripped.
 *
 * Everything the controller assigns — the id, the timestamps, the site — has to
 * go, or the create would be describing the object it was copied from. What is
 * left is this release's field set at its defaults, which is exactly what the
 * missing-fields problem needed.
 */
function blankOf(template: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(template)) {
    if (key === '_id' || key === 'site_id' || key === 'siteId') continue;
    if (key === 'attr_no_delete' || key === 'attr_hidden_id') continue;
    out[key] = value;
  }
  return out;
}

/** The controller's network ids for a set of VLANs, as far as they are known. */
function networkIdsFor(vlans: number[], unifi: UnifiSnapshot): string[] {
  const byVlan = new Map<number, string>();
  for (const n of unifi.networks) if (n.vlan != null) byVlan.set(n.vlan, n.id);
  return vlans.map((v) => byVlan.get(v)).filter((id): id is string => Boolean(id));
}

export interface FirewallCompileResult {
  operations: ApplyOperation[];
  /**
   * Zones the target state names that the controller does not have and this
   * cannot create — reported rather than silently dropped, because a rule
   * between zones that do not exist is a rule that was asked for and not made.
   */
  unresolved: string[];
}

/**
 * Builds the firewall operations, or none at all.
 *
 * `zoneOf` maps a target-state zone name onto the controller's zone of the same
 * name. Names are how a person refers to a zone and how the blueprint writes
 * one, so matching on them is matching on the thing both sides mean; a name
 * with nothing behind it is reported instead of guessed at.
 */
export function compileFirewallOperations(
  resolved: ResolvedBlueprint,
  unifi: UnifiSnapshot | null,
): FirewallCompileResult {
  const none: FirewallCompileResult = { operations: [], unresolved: [] };
  if (!unifi) return none;

  const zoneTemplate = parseTemplate(unifi.zoneTemplate);
  const policyTemplate = parseTemplate(unifi.policyTemplate);
  // No endpoint that answered, or no object to copy: nothing may be written.
  if (!unifi.policyEndpoint || !policyTemplate) return none;

  const surveyed = new Map<string, UnifiZone>(
    (unifi.zones ?? []).map((z) => [z.name.toUpperCase(), z]),
  );
  const membershipKey = keyUsed(zoneTemplate, NETWORK_IDS_KEYS) ?? 'network_ids';

  const operations: ApplyOperation[] = [];

  /* ------------------------------------------------------------- zones */

  // A zone groups networks and denies nothing, so it is safe to write and it
  // has to come first: a policy can only name a zone that exists.
  if (zoneTemplate && unifi.zoneEndpoint) {
    for (const zone of resolved.zones) {
      const ids = networkIdsFor(zone.vlans, unifi);
      // A zone whose networks the survey never saw would be written empty,
      // which is a different zone from the one asked for.
      if (ids.length !== zone.vlans.length) continue;

      operations.push(zoneOperation(zone, ids, membershipKey, zoneTemplate));
    }
  }

  /* ---------------------------------------------------------- policies */

  const zoneIdKey =
    keyUsed(policyTemplate['source'] as Record<string, unknown> | null, ZONE_ID_KEYS) ?? 'zone_id';
  const planned = new Set(resolved.zones.map((z) => z.name.toUpperCase()));
  const unresolved = new Set<string>();

  const resolvable = (name: string): boolean => {
    const key = name.toUpperCase();
    if (surveyed.has(key) || planned.has(key)) return true;
    unresolved.add(name);
    return false;
  };

  // Allows before blocks: permitting cannot close a path, so the operations
  // that could are the last ones taken and the first ones checked.
  const ordered = [...resolved.policies].sort((a, b) => {
    if (a.action !== b.action) return a.action === 'allow' ? -1 : 1;
    return a.order - b.order;
  });

  for (const policy of ordered) {
    // A rule target that names prose rather than a zone — "every zone", a list
    // — is not something to write; the plan carries it for a person to read.
    if (!isZoneName(policy.from) || !isZoneName(policy.to)) continue;
    if (!resolvable(policy.from) || !resolvable(policy.to)) continue;

    operations.push(policyOperation(policy, zoneIdKey, policyTemplate, surveyed));
  }

  return { operations, unresolved: [...unresolved] };
}

/**
 * Whether a rule end names one zone.
 *
 * The plan's broad rules name their target in prose — a comma-separated list, or
 * a sentence meaning "everything else" — because that is what a person needs to
 * read. None of it is writable, and trying to parse it back into zones would be
 * inventing an intention out of a description.
 */
function isZoneName(value: string): boolean {
  return /^[A-Z0-9][A-Z0-9-]*$/.test(value.trim());
}

function zoneOperation(
  zone: PlannedZone,
  networkIds: string[],
  membershipKey: string,
  template: Record<string, unknown>,
): ApplyOperation {
  return {
    id: `fwzone-${zone.name}`,
    kind: 'unifi.firewallzone',
    label: zone.name,
    moduleId: zone.moduleId,
    // The name is the natural key: a zone is identified by what it groups.
    matchField: 'name',
    matchValue: zone.name,
    desired: {
      name: zone.name,
      [membershipKey]: networkIds,
    },
    createOnly: blankOf(template),
    managedFields: ['name', membershipKey],
  };
}

function policyOperation(
  policy: PlannedPolicy,
  zoneIdKey: string,
  template: Record<string, unknown>,
  surveyed: Map<string, UnifiZone>,
): ApplyOperation {
  const end = (zoneName: string): Record<string, unknown> => {
    const base = { ...((template[zoneName === policy.from ? 'source' : 'destination'] ?? {}) as object) };
    const id = surveyed.get(zoneName.toUpperCase())?.id;
    return {
      ...base,
      // An id where the zone is already there; the name otherwise, which the
      // native side resolves once the zone operation before it has run.
      [zoneIdKey]: id ?? '',
      zone_name: zoneName,
      matching_target: 'ANY',
    };
  };

  const name = `${policy.from} → ${policy.to}`;
  return {
    id: `fwpolicy-${policy.order}-${policy.from}-${policy.to}`,
    kind: 'unifi.firewallpolicy',
    label: `${name} · ${policy.action}`,
    moduleId: policy.moduleId,
    matchField: 'name',
    matchValue: name,
    desired: {
      name,
      // Anything that is not an allow denies something, and is treated as a
      // block by the guard. Erring the other way would be erring towards the
      // rule that can close a path.
      action: policy.action === 'allow' ? 'ALLOW' : 'BLOCK',
      enabled: true,
      source: end(policy.from),
      destination: end(policy.to),
    },
    createOnly: blankOf(template),
    managedFields: ['name', 'action', 'enabled'],
    // Carried for the guard, which decides on the action and the zones rather
    // than on the object's fields.
    policy: {
      from: policy.from,
      to: policy.to,
      action: policy.action === 'allow' ? 'allow' : 'block',
    },
  };
}
