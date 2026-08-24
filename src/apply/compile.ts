import type { PlannedNetwork, ResolvedBlueprint } from '@/blueprint/model';
import type { UnifiSnapshot } from '@/survey/model';
import { compileFirewallOperations } from './firewall';
import type { ApplyOperation } from './model';

/*
 * Target state → write operations.
 *
 * The input is the typed target state, not the plan's prose, so nothing here
 * parses a sentence to decide what to change.
 */

/** Networks whose role means "guests" get UniFi's guest treatment. */
const GUEST_ROLES = new Set(['guest']);

function prefixLength(cidr: string): number {
  const parsed = Number(cidr.split('/')[1]);
  return Number.isFinite(parsed) ? parsed : 24;
}

/** First three octets of a /24, e.g. "192.168.10". */
function base24(cidr: string): string | null {
  const [address] = cidr.split('/');
  const parts = (address ?? '').split('.');
  if (parts.length !== 4) return null;
  return parts.slice(0, 3).join('.');
}

/**
 * UniFi stores the gateway address with the prefix, not the network address:
 * `192.168.10.1/24`, not `192.168.10.0/24`.
 */
function ipSubnet(network: PlannedNetwork): string {
  return `${network.gateway}/${prefixLength(network.cidr)}`;
}

export function compileNetworkOperations(resolved: ResolvedBlueprint): ApplyOperation[] {
  return resolved.networks.map((network) => {
    const guest = GUEST_ROLES.has(network.role);
    const base = base24(network.cidr);

    return {
      id: `net-${network.vlan}`,
      kind: 'unifi.network' as const,
      label: `VLAN ${network.vlan} · ${network.name}`,
      moduleId: network.moduleId,
      role: network.role,
      // VLAN id is the natural key: names get edited, ids do not.
      matchField: 'vlan',
      matchValue: network.vlan,
      desired: {
        name: network.name,
        purpose: guest ? 'guest' : 'corporate',
        vlan_enabled: true,
        vlan: network.vlan,
        ip_subnet: ipSubnet(network),
        enabled: true,
      },
      createOnly: {
        networkgroup: 'LAN',
        dhcpd_enabled: true,
        ...(base ? { dhcpd_start: `${base}.6`, dhcpd_stop: `${base}.254` } : {}),
      },
      // Deliberately narrow: DHCP options, DNS overrides, IGMP and everything
      // else the controller offers stay whatever the site already had.
      managedFields: ['name', 'purpose', 'vlan_enabled', 'vlan', 'ip_subnet', 'enabled'],
    };
  });
}

/**
 * Port profiles.
 *
 * Safe to write, and the reason is worth stating: a profile changes nothing
 * until a port is pointed at it. Creating one is inert. Pointing a port at it
 * is a PUT on the device object, and on the wrong port that cuts the
 * controller's own uplink — so that half stays out of the writable set and
 * lands in the plan with exact values instead.
 *
 * Networks are referenced by id, which only the live snapshot knows, so the
 * VLAN numbers are carried through and resolved natively at apply time.
 */
export function compilePortProfileOperations(resolved: ResolvedBlueprint): ApplyOperation[] {
  return resolved.portProfiles.map((profile) => ({
    id: `portconf-${profile.name}`,
    kind: 'unifi.portconf' as const,
    label: profile.name,
    moduleId: 'vlan-wifi',
    // The name is the natural key: a profile is identified by what it is for.
    matchField: 'name',
    matchValue: profile.name,
    desired: {
      name: profile.name,
      forward: profile.role === 'off' ? 'disabled' : 'customize',
      native_vlan: profile.nativeVlan,
      tagged_vlans: profile.taggedVlans,
      poe_mode: profile.poe ? 'auto' : 'off',
    },
    createOnly: {
      autoneg: true,
      isolation: false,
      stormctrl_bcast_enabled: false,
      lldpmed_enabled: true,
    },
    managedFields: ['name', 'forward', 'native_vlan', 'tagged_vlans', 'poe_mode'],
  }));
}

/**
 * Every operation, in the order they must be applied.
 *
 * Networks and port profiles first, because a firewall zone refers to networks
 * by id and they have to exist; then the firewall, whose own ordering — zones,
 * then allows, then blocks — is decided in `firewall.ts`. The result is that
 * the operations which could close a path are the last ones taken.
 *
 * The firewall half needs the survey: it copies the shape of an object this
 * controller already holds rather than inventing one. With no survey it
 * contributes nothing, which is the same answer as before this existed.
 */
export function compileOperations(
  resolved: ResolvedBlueprint,
  unifi: UnifiSnapshot | null = null,
): ApplyOperation[] {
  return [
    ...compileNetworkOperations(resolved),
    ...compilePortProfileOperations(resolved),
    ...compileFirewallOperations(resolved, unifi).operations,
  ];
}
