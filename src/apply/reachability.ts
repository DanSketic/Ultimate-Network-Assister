import type { LiveFirewall } from '@/survey/liveFirewall';
import { reachability, zoneOfVlan } from '@/survey/liveFirewall';
import type { UnifiNetwork, UnifiSnapshot } from '@/survey/model';
import { containsAddress } from './subnet';

/*
 * The path this application is standing on.
 *
 * Everything the apply pipeline is allowed to write has been chosen so far by
 * what it cannot break. That is a real answer but a narrow one, and it leaves
 * the firewall — the thing most worth getting right — permanently out of reach.
 * The wider answer needs the question asked directly: which network, and which
 * firewall zone, is carrying the session that would have to undo a mistake?
 *
 * Two facts make the difference between a guard and a hope.
 *
 * The first is that the undo is not symmetric with the do. A change that cuts
 * the path to the controller cannot be rolled back through that same path, and
 * on UniFi the gateway is not the owner of its own ruleset — the controller
 * re-provisions it — so a dead man's switch armed on the gateway would be
 * fighting the thing that is about to overwrite it. The only reliable defence
 * is therefore to refuse in advance, not to undo afterwards.
 *
 * The second is that a refusal is only as good as what it is computed from. A
 * zone pair the loaded ruleset never mentioned is not thereby safe; it is
 * unknown, and this module says so rather than waving it through. Where the
 * live ruleset was not read at all, nothing that could deny anything is
 * allowed, because the instrument that would confirm the result is missing.
 */

export interface AdminPath {
  /** The address the application reaches the controller on. */
  host: string;
  /** The surveyed network containing it, when one does. */
  network: UnifiNetwork | null;
  /** Its firewall zone, when the loaded ruleset named one. */
  zone: string | null;
  /** Whether the loaded ruleset was read at all. */
  measured: boolean;
}

/** Why a write is refused. The interface turns these into sentences. */
export type RefusalCode =
  | 'adminNetwork'
  | 'adminZone'
  | 'unmeasured'
  | 'unknownZone'
  | 'wouldCloseAdminPath';

export interface Refusal {
  code: RefusalCode;
  /** The zone or network the refusal is about, for the message. */
  where: string;
}

/**
 * Works out where the application is standing.
 *
 * The network is found by containment rather than by a prefix comparison, so a
 * controller on a /22 is placed in its network rather than in none. The zone
 * comes from the loaded ruleset, which is the only source that knows how the
 * gateway groups the bridges; with no ruleset read, the zone is null and every
 * rule guard below refuses on that basis alone.
 */
export function adminPathOf(unifi: UnifiSnapshot | null, host: string, live: LiveFirewall | null): AdminPath {
  const network =
    unifi?.networks.find((n) => n.subnet && containsAddress(n.subnet, host)) ?? null;
  return {
    host,
    network,
    zone: live?.read && network ? zoneOfVlan(live, network.vlan) : null,
    // `read` rather than the presence of an object: a parse of nothing is a
    // LiveFirewall too, and it establishes nothing.
    measured: live?.read === true,
  };
}

/**
 * Whether a network may be written.
 *
 * The network carrying the session is off limits whatever the change looks
 * like: an address, a VLAN id or a purpose are all enough to end the session
 * mid-run, with the rest of the operations unapplied and no way to finish or
 * undo them.
 */
export function guardNetwork(subnet: string | undefined, path: AdminPath): Refusal | null {
  if (!subnet || !path.network?.subnet) return null;
  return containsAddress(subnet, path.host) ||
    containsAddress(path.network.subnet, subnet.split('/')[0] ?? '')
    ? { code: 'adminNetwork', where: path.network.name }
    : null;
}

/**
 * Whether a firewall policy may be written.
 *
 * A policy that only permits cannot cut anybody off, so an allow passes on any
 * pair. A block is judged against the path this application is standing on, and
 * refused wherever it could be the rule that ends the session:
 *
 *   - the ruleset was never read, so nothing can be confirmed afterwards;
 *   - either end is the zone the controller is reached through;
 *   - either end is a zone the ruleset never named, which is unknown rather
 *     than harmless;
 *   - the pair currently carries the admin path, whatever the zone names say.
 *
 * What is left after those refusals is the large, dull majority: guests kept
 * off the cameras, sensors kept off the servers — the rules that are worth
 * having and cannot reach the person applying them.
 */
export function guardPolicy(
  policy: { from: string; to: string; action: 'allow' | 'block' },
  path: AdminPath,
  live: LiveFirewall | null,
): Refusal | null {
  if (policy.action === 'allow') return null;

  if (!live?.read || !path.measured) return { code: 'unmeasured', where: policy.from };
  if (!path.zone) return { code: 'unknownZone', where: path.network?.name ?? path.host };

  for (const end of [policy.from, policy.to]) {
    // A zone named in a policy but absent from the loaded ruleset cannot be
    // reasoned about; the gateway may be grouping bridges in a way this has
    // not seen.
    if (!live.zones.includes(end)) return { code: 'unknownZone', where: end };
    if (end === path.zone) return { code: 'adminZone', where: end };
  }

  return null;
}

/**
 * Whether the admin path still stands under the loaded ruleset.
 *
 * Used after a write rather than before it: the same instrument that decided
 * the change was safe is the one that has to confirm it was. A pair that reads
 * `block` where the session is plainly working means the reading is wrong, not
 * the session — so an absent or contradictory answer is reported rather than
 * acted on.
 */
export function adminPathHolds(
  path: AdminPath,
  live: LiveFirewall | null,
  fromVlan: number | null,
): boolean | null {
  if (!live?.read || !path.network) return null;
  const pair = reachability(live, fromVlan, path.network.vlan);
  if (!pair) return null;
  return pair.verdict !== 'block';
}

