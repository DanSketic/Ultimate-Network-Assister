import type { Dict } from '@/i18n';
import type {
  NetworkRole,
  PlannedNetwork,
  PlannedPort,
  PlannedPortProfile,
  PortAssignment,
  PortRole,
} from './model';

/*
 * Port configuration, worked out rather than typed.
 *
 * The user says what a port is *for*; this decides which VLANs it must pass.
 * That direction matters: a hand-written tagged-VLAN list is how a trunk ends
 * up missing one network, and the symptom — an SSID that hands out no address
 * on one floor — points nowhere near the cause.
 *
 * Because the rule is expressed against network *roles*, it is preset-agnostic:
 * adding a household, switching the layout or enabling the camera module
 * updates every affected port with no change here.
 */

/** Which network roles each port role has to carry, tagged. */
const CARRIES: Record<PortRole, NetworkRole[] | 'all' | 'none'> = {
  // An access port carries exactly one network, and it is untagged.
  access: 'none',
  // Wi-Fi: every network an SSID can drop a client into. Cameras are wired, so
  // they are deliberately absent — an AP trunk carrying them would be a wider
  // path than anything needs.
  ap: ['household', 'iot', 'guest'],
  // The hypervisor trunk: every network a guest machine can sit in. The
  // recorder is one, so cameras belong here even though the cameras do not.
  server: ['infra', 'server-prod', 'server-test', 'media', 'dmz', 'rdp', 'printers', 'cameras'],
  // Switch to switch, and switch to gateway: everything.
  trunk: 'all',
  uplink: 'all',
  off: 'none',
};

/** Roles whose native VLAN is management rather than a chosen network. */
const MANAGEMENT_NATIVE: PortRole[] = ['ap', 'server', 'trunk', 'uplink'];

function managementVlan(networks: PlannedNetwork[]): number {
  return networks.find((n) => n.role === 'management')?.vlan ?? 0;
}

/**
 * The VLAN set for one port, sorted so two ports with the same purpose produce
 * the same profile name instead of two that differ only in ordering.
 */
function taggedFor(role: PortRole, networks: PlannedNetwork[]): number[] {
  const carries = CARRIES[role];
  if (carries === 'none') return [];

  const mgmt = managementVlan(networks);
  const wanted =
    carries === 'all'
      ? networks
      : networks.filter((n) => (carries as NetworkRole[]).includes(n.role));

  return [...new Set(wanted.map((n) => n.vlan))]
    .filter((v) => v > 0 && v !== mgmt)
    .sort((a, b) => a - b);
}

/**
 * Names the profile after what it does, not after the port it was first seen
 * on — so every AP port lands on one profile instead of one profile each.
 */
function profileName(
  role: PortRole,
  nativeVlan: number,
  networks: PlannedNetwork[],
  x: Dict['ports']['profiles'],
): string {
  if (role === 'off') return x.disabled;
  if (role === 'access') {
    const net = networks.find((n) => n.vlan === nativeVlan);
    return net ? `${x.accessPrefix}-${net.name}` : x.accessUnassigned;
  }
  return { ap: x.ap, server: x.server, trunk: x.trunk, uplink: x.uplink }[role];
}

export interface PortPlan {
  ports: PlannedPort[];
  profiles: PlannedPortProfile[];
}

export function derivePorts(
  assignments: PortAssignment[],
  networks: PlannedNetwork[],
  t: Dict,
): PortPlan {
  const x = t.ports.profiles;
  const mgmt = managementVlan(networks);

  const ports = assignments.map<PlannedPort>((a) => {
    const nativeVlan = MANAGEMENT_NATIVE.includes(a.role) ? mgmt : a.nativeVlan;
    return {
      device: a.device,
      idx: a.idx,
      label: a.label,
      role: a.role,
      nativeVlan,
      taggedVlans: taggedFor(a.role, networks),
      poe: a.poe,
      profile: profileName(a.role, nativeVlan, networks, x),
    };
  });

  // One profile per distinct purpose, with the ports that use it counted.
  const byName = new Map<string, PlannedPortProfile>();
  for (const p of ports) {
    const existing = byName.get(p.profile);
    if (existing) {
      existing.portCount += 1;
      continue;
    }
    byName.set(p.profile, {
      name: p.profile,
      role: p.role,
      nativeVlan: p.nativeVlan,
      taggedVlans: p.taggedVlans,
      poe: p.poe,
      purpose: x.purpose[p.role],
      portCount: 1,
    });
  }

  const profiles = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { ports, profiles };
}

/**
 * Contradictions the port plan can produce on its own.
 *
 * Kept here rather than in the general validator because every one of them is
 * about ports specifically, and the messages have to name the port.
 */
export function portIssues(
  ports: PlannedPort[],
  networks: PlannedNetwork[],
  t: Dict,
): { severity: 'error' | 'warning'; message: string; where: string }[] {
  const x = t.ports.issue;
  const out: { severity: 'error' | 'warning'; message: string; where: string }[] = [];
  const seen = new Map<string, string>();
  const vlans = new Set(networks.map((n) => n.vlan));

  for (const p of ports) {
    const key = `${p.device}#${p.idx}`;
    const previous = seen.get(key);
    if (previous) {
      out.push({ severity: 'error', message: x.duplicate(p.device, p.idx), where: key });
    } else {
      seen.set(key, p.label);
    }

    if (p.role === 'access' && p.nativeVlan === 0) {
      out.push({ severity: 'error', message: x.noNetwork(p.device, p.idx), where: key });
    }
    if (p.nativeVlan > 0 && !vlans.has(p.nativeVlan)) {
      out.push({
        severity: 'error',
        message: x.unknownVlan(p.device, p.idx, p.nativeVlan),
        where: key,
      });
    }
  }

  // A switch with no uplink is either mis-described or genuinely stranded.
  const devices = [...new Set(ports.map((p) => p.device))];
  for (const device of devices) {
    const mine = ports.filter((p) => p.device === device);
    if (!mine.some((p) => p.role === 'uplink' || p.role === 'trunk')) {
      out.push({ severity: 'warning', message: x.noUplink(device), where: device });
    }
  }

  return out;
}
