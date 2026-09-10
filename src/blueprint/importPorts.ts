import type {
  SurveySnapshot,
  UnifiClient,
  UnifiDevice,
  UnifiNetwork,
  UnifiPort,
  UnifiPortProfile,
  UnifiSnapshot,
} from '@/survey/model';
import type { ExtraNetwork, PlannedNetwork, PortAssignment, PortRole } from './model';

/*
 * The port layout, read out of a survey instead of typed.
 *
 * The controller knows more about a port than the port table alone says, and
 * the earlier import only read the port table. Three sources measure what is on
 * a port, and all three are used here:
 *
 *   1. LLDP — the far end announces itself. Best, and often absent.
 *   2. The uplink report — a UniFi device states which port of its parent it
 *      hangs off. Works when the child is managed but silent.
 *   3. The wired client the controller learned on the port — the only source
 *      that reaches equipment the controller does not manage at all, such as a
 *      Proxmox host with no `lldpd`.
 *
 * The same three are what the estate view draws its cables from; a port view
 * that used fewer of them would show empty rows next to a topology that names
 * the machine.
 *
 * The controller also knows what the port is *configured* as — its profile,
 * that profile's untagged network, and whether PoE is switched on there. That
 * is what turns an imported row from "port 7, something on it" into a row whose
 * native network is already right, so the work is checking rather than typing.
 *
 * Nothing here guesses. A field the survey did not measure is left empty, and
 * the role — the one judgement call — is a suggestion the user corrects.
 */

/** What one imported port is worth reporting as. */
export interface PortImport {
  /** The merged layout: what was there, plus what the survey adds. */
  ports: PortAssignment[];
  /** Rows the survey contributed that were not in the layout. */
  added: number;
  /** Existing rows a measured fact was filled into, without overwriting choices. */
  enriched: number;
  /** Existing rows left exactly as they were. */
  kept: number;
  /**
   * Of the rows brought in, how many are ports with nothing on them.
   *
   * They are imported like any other — a layout that shows 8 of a switch's 24
   * ports is not a description of the switch — and counted separately because
   * "24 new ports, 16 of them free" is the sentence someone needs to see, not
   * "24 new ports".
   */
  unused: number;
  /**
   * Networks the survey measured on a port and the target state has no
   * counterpart for.
   *
   * The one thing an import cannot do is invent the network a port is on, and
   * the one thing it must not do is stay quiet about that. A row that comes in
   * with no native network is either a port with nothing measured on it or a
   * port on a network the plan does not describe, and only the second is
   * something the reader can act on.
   *
   * Handed over whole rather than by name, because the answer to "the plan has
   * no network for this" is usually "then add it", and everything needed to do
   * that was measured: the VLAN, the address range and the gateway the estate
   * is already using. The role is the one thing nobody measured, so it comes
   * in as a starting point for the user to correct rather than as a fact.
   */
  unmatched: ExtraNetwork[];
}

/** How a device announces what it is, in the controller's vocabulary. */
function roleForKind(kind: string, model: string): PortRole | null {
  const k = `${kind} ${model}`.toLowerCase();
  if (/ugw|udm|uxg|ucg|udr|gateway/.test(k)) return 'uplink';
  if (/usw|usl|switch|flex/.test(k)) return 'trunk';
  if (/uap|u6|u7|u5|uwb|access.?point/.test(k)) return 'ap';
  return null;
}

/** The same question answered from a name, where there is no device to ask. */
function roleForName(name: string): PortRole | null {
  const n = name.toLowerCase();
  if (!n) return null;
  if (/\bap\b|u6|u7|uap|access.?point/.test(n)) return 'ap';
  if (/usw|switch|flex|swit/.test(n)) return 'trunk';
  if (/udm|ugw|uxg|ucg|udr|gateway|router|edgerouter/.test(n)) return 'uplink';
  if (/pve|proxmox|esxi|hyperv|server|nas|truenas|unraid/.test(n)) return 'server';
  return null;
}

const POE_ON = new Set(['auto', 'pasv24', 'passthrough', 'passive24v', 'poe+', '802.3at']);

/**
 * The names a controller gives a port it knows nothing about.
 *
 * "Port 6" and "SFP+ 1" are what the switch calls its own sockets, not
 * anything anybody measured or typed. Imported as labels they look like
 * content — the column reads "Port 6" where it should read "the switch in the
 * cellar" — and, worse, they then count as something the user wrote, so the
 * next survey refuses to replace them with the name it did measure. A port
 * name the user actually set in the controller is worth having; these are not.
 */
const DEFAULT_PORT_NAME = /^(port|sfp\+?|lan|wan)\s*\d*$/i;

function ownName(name: string): string {
  const trimmed = name.trim();
  return DEFAULT_PORT_NAME.test(trimmed) ? '' : trimmed;
}

/** What the far end of a port is, as far as anything measured it. */
interface FarEnd {
  /** A name to put in the label column; empty when nothing named it. */
  label: string;
  /** The managed device on the other end, where the far end is one. */
  device?: UnifiDevice;
  /** The wired client learned on the port, where there is one. */
  client?: UnifiClient;
}

/**
 * The three measured sources, in the order of how much they know.
 *
 * LLDP names the far end and its port. The uplink report names a device but
 * only for managed hardware. A wired client names a machine the controller
 * never managed — weakest as evidence of a *cable*, strongest as evidence of
 * *what is plugged in*, which is what this column is for.
 */
function farEndOf(
  device: UnifiDevice,
  port: UnifiPort,
  byMac: Map<string, UnifiDevice>,
  uplinks: Map<string, UnifiDevice>,
  clients: Map<string, UnifiClient>,
): FarEnd {
  const key = `${device.mac.toLowerCase()}#${port.idx}`;

  const lldpDevice = port.neighbourMac ? byMac.get(port.neighbourMac.toLowerCase()) : undefined;
  const uplinkDevice = uplinks.get(key);
  const client = clients.get(key);
  const far = lldpDevice ?? uplinkDevice;

  const label =
    port.neighbourName ||
    far?.name ||
    far?.model ||
    client?.hostname ||
    client?.ip ||
    (client?.oui ? client.oui : '') ||
    '';

  return { label, device: far, client };
}

/** Which managed device hangs off which port of its parent, both directions. */
function uplinkMap(devices: UnifiDevice[]): Map<string, UnifiDevice> {
  const byMac = new Map(devices.map((d) => [d.mac.toLowerCase(), d]));
  const out = new Map<string, UnifiDevice>();
  for (const d of devices) {
    const parent = d.uplinkMac ? byMac.get(d.uplinkMac.toLowerCase()) : undefined;
    // The parent's port carries this device...
    if (d.uplinkRemotePort > 0 && d.uplinkMac) {
      out.set(`${d.uplinkMac.toLowerCase()}#${d.uplinkRemotePort}`, d);
    }
    // ...and this device's own port carries the parent.
    if (d.uplinkLocalPort > 0 && parent) {
      out.set(`${d.mac.toLowerCase()}#${d.uplinkLocalPort}`, parent);
    }
  }
  return out;
}

/** The wired client the controller learned on each port. */
function clientMap(unifi: UnifiSnapshot): Map<string, UnifiClient> {
  const out = new Map<string, UnifiClient>();
  for (const c of unifi.clients) {
    if (!c.wired || !c.switchMac || c.switchPort <= 0) continue;
    const key = `${c.switchMac.toLowerCase()}#${c.switchPort}`;
    // First one wins: a port with several machines behind it is a trunk into
    // something unmanaged, and naming it after any one of them would be a lie
    // the role guess then compounds.
    if (!out.has(key)) out.set(key, c);
  }
  return out;
}

/**
 * Which planned network a surveyed one is, where they are the same network.
 *
 * By VLAN id first, which is the whole answer when the target state keeps the
 * numbering the estate already has. It often does not — a plan is frequently
 * the renumbering — and then the port still sits on a network the plan
 * describes, under a different number. So the subnet is tried next: two
 * networks with the same address range are one network whatever either side
 * calls it. The name is the last resort, and the weakest, which is why it is
 * last.
 *
 * The default LAN is what makes this necessary rather than merely nice. On a
 * stock switch every port carries the "All" profile, whose untagged network is
 * the default LAN — and that network has no VLAN id at all, so matching on the
 * number alone answered "nothing measured" for every port on the switch. It is
 * a real network with a real subnet, and the port really is on it.
 */
/** An IPv4 address as a number, or null for anything that is not one. */
function ipToNumber(ip: string): number | null {
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return null;
  let out = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    out = out * 256 + n;
  }
  return out;
}

/**
 * Whether an address sits inside a planned network.
 *
 * The measurement that survives everything else being renamed or renumbered: a
 * machine answering on 10.0.20.50 is on the network the plan calls
 * 10.0.20.0/24, whatever either side has christened it and whatever VLAN id the
 * controller does or does not attach to it.
 */
function inCidr(ip: string, cidr: string): boolean {
  const [base = '', bitsText = ''] = cidr.trim().split('/');
  const bits = Number(bitsText);
  const address = ipToNumber(ip);
  const network = ipToNumber(base);
  if (address === null || network === null || !Number.isInteger(bits) || bits < 0 || bits > 32) {
    return false;
  }
  if (bits === 0) return true;
  // >>> 0 because a 32-bit shift in JS is signed, and /1 networks would come
  // out negative and never match.
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return ((address & mask) >>> 0) === ((network & mask) >>> 0);
}

/**
 * Which planned network a surveyed one is, where they are the same network.
 *
 * By VLAN id first, which is the whole answer when the target state keeps the
 * numbering the estate already has. It often does not — a plan is frequently
 * the renumbering — and then the port still sits on a network the plan
 * describes, under a different number. So the address range is tried next: two
 * networks covering the same addresses are one network whatever either side
 * calls it, and that holds whether the two write the range identically or not.
 * The name is the last resort, and the weakest, which is why it is last.
 *
 * The default LAN is what makes this necessary rather than merely nice. On a
 * stock switch every port carries the "All" profile, whose untagged network is
 * the default LAN — and that network has no VLAN id at all, so matching on the
 * number alone answered "nothing measured" for every port on the switch. It is
 * a real network with a real subnet, and the port really is on it.
 */
function plannedVlanOf(net: UnifiNetwork | undefined, networks: PlannedNetwork[]): number {
  if (!net) return 0;

  if (net.vlan) {
    const byVlan = networks.find((n) => n.vlan === net.vlan);
    if (byVlan) return byVlan.vlan;
  }

  const subnet = net.subnet.trim();
  if (subnet) {
    const written = subnet.toLowerCase();
    const bySubnet = networks.find((n) => n.cidr.trim().toLowerCase() === written);
    if (bySubnet) return bySubnet.vlan;

    // The same range written differently — 10.0.20.0/24 against a plan that
    // writes 10.0.20.1/24, or a /25 the plan states as a /24 it sits inside.
    const address = subnet.split('/')[0] ?? '';
    const byRange = networks.find((n) => inCidr(address, n.cidr) || inCidr(n.gateway, subnet));
    if (byRange) return byRange.vlan;
  }

  const name = net.name.trim().toLowerCase();
  if (name) {
    const byName = networks.find((n) => n.name.trim().toLowerCase() === name);
    if (byName) return byName.vlan;
  }

  return 0;
}

/**
 * The network the controller currently has untagged on a port.
 *
 * Read through the port profile, because that is where the controller keeps it:
 * the port names a profile, the profile names a network. Where the port has no
 * profile, or the profile's network is not one the plan has, the wired client
 * is the next best measurement — the network it landed in is where the machine
 * actually is, which is the same question asked from the other end.
 */
function nativeVlanOf(
  port: UnifiPort,
  client: UnifiClient | undefined,
  profiles: Map<string, UnifiPortProfile>,
  netById: Map<string, UnifiNetwork>,
  networks: PlannedNetwork[],
): number {
  const profile = port.portConfId ? profiles.get(port.portConfId) : undefined;
  if (profile?.nativeNetworkId) {
    const vlan = plannedVlanOf(netById.get(profile.nativeNetworkId), networks);
    if (vlan > 0) return vlan;
  }

  if (client) {
    // The client states a VLAN, a network name and an address, and any of the
    // three can be the one the plan knows. The address is the one that always
    // works: a controller that reports no profile on the port, no VLAN on the
    // client and a network name the plan never used still says where the
    // machine answered, and that is enough to place it.
    const byVlan = client.vlan ? networks.find((n) => n.vlan === client.vlan) : undefined;
    if (byVlan) return byVlan.vlan;

    const byAddress = client.ip ? networks.find((n) => inCidr(client.ip, n.cidr)) : undefined;
    if (byAddress) return byAddress.vlan;

    const name = client.network.trim().toLowerCase();
    const byName = name ? networks.find((n) => n.name.trim().toLowerCase() === name) : undefined;
    if (byName) return byName.vlan;
  }

  return 0;
}

/**
 * The network address of a range, given any address inside it.
 *
 * The controller writes a network's range from the gateway's point of view —
 * `192.168.16.1/24` — and a target state writes it from the network's:
 * `192.168.16.0/24`. Both describe the same addresses, and this is the
 * conversion between them.
 */
function networkAddress(subnet: string): { cidr: string; gateway: string } | null {
  const [address = '', bitsText = ''] = subnet.trim().split('/');
  const bits = Number(bitsText);
  const value = ipToNumber(address);
  if (value === null || !Number.isInteger(bits) || bits < 1 || bits > 32) return null;

  const mask = (0xffffffff << (32 - bits)) >>> 0;
  const base = (value & mask) >>> 0;
  const octets = [base >>> 24, (base >>> 16) & 255, (base >>> 8) & 255, base & 255];
  const cidr = `${octets.join('.')}/${bits}`;

  /*
   * The gateway, only where the controller actually stated one.
   *
   * UniFi normally writes a network's range as its gateway plus the prefix,
   * which is where the address comes from. Where it wrote the network address
   * instead, nobody said where the gateway is — and inventing the usual `.1`
   * would be a guess written into the target state as a measurement.
   */
  return { cidr, gateway: address === `${octets.join('.')}` ? '' : address };
}

/**
 * The network a port was measured to be on, for when none of it matched.
 *
 * An import that fills nothing and says nothing leaves the reader with no way
 * to tell "the survey saw no network here" from "the survey saw one your plan
 * does not have". This is what to put in front of them — and, where the
 * controller knows the range, enough to add it to the plan with one click.
 */
function measuredNetwork(
  port: UnifiPort,
  client: UnifiClient | undefined,
  profiles: Map<string, UnifiPortProfile>,
  netById: Map<string, UnifiNetwork>,
): ExtraNetwork | null {
  const profile = port.portConfId ? profiles.get(port.portConfId) : undefined;
  const viaProfile = profile?.nativeNetworkId ? netById.get(profile.nativeNetworkId) : undefined;

  /*
   * The controller's own network object, however the port led to it.
   *
   * Through the profile where there is one, and otherwise by what the client
   * says it is on — a machine reporting VLAN 16 is on the network the
   * controller has as VLAN 16, and that network is where the address range
   * lives. Without this step a network found only through a client arrived
   * with no range at all, and had to be typed in by hand from a controller
   * that had already been asked.
   */
  const net =
    viaProfile ??
    [...netById.values()].find(
      (n) =>
        (client?.vlan && n.vlan === client.vlan) ||
        (!!client?.network && n.name.trim().toLowerCase() === client.network.trim().toLowerCase()),
    );

  const name = net?.name || client?.network || '';
  const vlan = net?.vlan ?? client?.vlan ?? 0;
  // Without a VLAN id there is nothing to add a network under: an untagged
  // network the plan has no counterpart for is the estate's default LAN, and
  // the target state's own management network is what that becomes.
  if (!name || !vlan) return null;

  const range = net?.subnet ? networkAddress(net.subnet) : null;
  return {
    vlan,
    name,
    cidr: range?.cidr ?? '',
    gateway: range?.gateway ?? '',
    // Nobody measured what the network is *for*. IoT is the honest starting
    // point for a network found on a switch port and nowhere in the plan —
    // it is carried by the Wi-Fi trunks and reaches nothing on its own — and
    // it is a choice the user is asked to check rather than one hidden here.
    role: 'iot',
    purpose: '',
  };
}

/** Whether PoE is switched on for the port, rather than drawing power now. */
function poeOf(port: UnifiPort, profiles: Map<string, UnifiPortProfile>): boolean {
  if (port.poeEnabled) return true;
  const profile = port.portConfId ? profiles.get(port.portConfId) : undefined;
  return profile ? POE_ON.has(profile.poeMode.toLowerCase()) : false;
}

/**
 * The role to suggest, from everything measured about the port.
 *
 * The one that matters most is the one nothing was measured on. A dark port
 * with no neighbour, no client and no uplink report is not an access port
 * waiting for a network to be chosen — calling it that would put an error next
 * to every free port on the switch. It is free, and `unused` says exactly that
 * and asks nothing of anybody.
 */
function roleOf(port: UnifiPort, far: FarEnd, wan: boolean): PortRole {
  if (!port.enabled) return 'off';
  // The socket the internet comes in on counts as the way out, as the port
  // table's own uplink flag does; see `wanPorts` for why it needs saying.
  if (port.isUplink || wan) return 'uplink';
  if (far.device) {
    const byKind = roleForKind(far.device.kind, far.device.model);
    if (byKind) return byKind;
  }
  const byName = roleForName(far.label) ?? roleForName(far.client?.hostname ?? '');
  if (byName) return byName;
  if (!port.up && far.label === '' && !far.client) return 'unused';
  return 'access';
}

/**
 * Reads a port layout out of a survey and merges it into the one on hand.
 *
 * Merging rather than replacing is the point: the role and the native network
 * are the two things the user corrects by hand, and an import that threw them
 * away every time would make a second survey cost more than it gave. An
 * existing row keeps every choice on it; only fields still empty are filled
 * from what was measured.
 */
export function importPortsFromSurvey(
  snapshot: SurveySnapshot | null,
  existing: PortAssignment[],
  networks: PlannedNetwork[],
): PortImport {
  const unifi = snapshot?.unifi;
  if (!unifi) {
    return {
      ports: existing,
      added: 0,
      enriched: 0,
      kept: existing.length,
      unused: 0,
      unmatched: [],
    };
  }

  const devices = unifi.devices;
  const byMac = new Map(devices.map((d) => [d.mac.toLowerCase(), d]));
  const uplinks = uplinkMap(devices);
  const clients = clientMap(unifi);
  const profiles = new Map(unifi.portProfiles.map((p) => [p.id, p]));
  const netById = new Map(unifi.networks.map((n) => [n.id, n]));

  /*
   * The gateway's own way out, by port.
   *
   * A gateway reports its WAN apart from its port table, and the port table
   * does not flag that socket as an uplink. So every gateway came in with no
   * uplink at all: its WAN port read as an access port with no network, and
   * the layout warned that the gateway could not reach the rest of the
   * network. The WAN report names the port — a measurement, not a guess.
   */
  const wanPorts = new Map(
    (unifi.wans ?? [])
      .filter((w) => w.deviceMac && w.portIdx > 0)
      .map((w) => [`${w.deviceMac.toLowerCase()}#${w.portIdx}`, w]),
  );

  const measured = new Map<string, PortAssignment>();
  const unmatched = new Map<number, ExtraNetwork>();
  /**
   * Layout keys of the ports whose role is measured rather than suggested:
   * the gateway's WAN, a port the device flags as its own uplink, and a port
   * with a managed device of this controller's on the far end — found by LLDP
   * or by that device's own uplink report, never by a name.
   */
  const measuredRole = new Set<string>();

  for (const d of devices) {
    const deviceName = d.name || d.model || d.mac;
    /*
     * Every port on the device, including the free ones.
     *
     * An earlier version left out the empty, enabled, dark port on the grounds
     * that twenty of those would bury the six that matter. What it actually
     * produced was a layout that disagreed with the switch in front of you:
     * ports 3, 9 and 14 present and the rest simply absent, with no way to
     * tell a port nobody uses from a port the import failed to read. The
     * ports are grouped by device now, and a free port carries a role that
     * says so and asks nothing — so the whole port table comes in, and the
     * device the layout describes is the device that is there.
     */
    for (const p of d.ports) {
      const far = farEndOf(d, p, byMac, uplinks, clients);
      const wan = wanPorts.get(`${d.mac.toLowerCase()}#${p.idx}`);
      const role = roleOf(p, far, wan !== undefined);
      if (wan || p.isUplink || far.device) measuredRole.add(`${deviceName}#${p.idx}`);
      /*
       * The measurement is already a planned VLAN or it is nothing.
       *
       * Matching happens against the target state, so a number that reaches
       * here is one the plan carries — a raw VLAN id from the estate would
       * produce a row the plan then reports as its own error.
       */
      const vlan = nativeVlanOf(p, far.client, profiles, netById, networks);

      /*
       * A port that is on something the plan has no network for: worth saying
       * out loud whatever role was suggested, because the fact is about the
       * estate rather than about the port — the plan does not describe a
       * network this estate is running. Only the ports with nothing on them
       * are left out of it, where there is nothing to say.
       */
      if (vlan === 0 && role !== 'unused' && role !== 'off' && !wan) {
        const net = measuredNetwork(p, far.client, profiles, netById);
        if (net && !unmatched.has(net.vlan)) unmatched.set(net.vlan, net);
      }

      measured.set(`${deviceName}#${p.idx}`, {
        id: `port-${d.mac}-${p.idx}`,
        device: deviceName,
        idx: p.idx,
        // The provider, where the controller knows it, is what is on a WAN port.
        label: far.label || ownName(p.name) || (wan ? wan.isp || wan.name : ''),
        role,
        /*
         * The network measured on the port, whatever role was suggested for it.
         *
         * The plan only reads this for an access port — every other role takes
         * management natively — but the role is a suggestion the user
         * corrects, and clearing the measurement for a port suggested as a
         * trunk meant that correcting it to access left an empty network
         * behind, with nothing left to fill it from.
         */
        nativeVlan: vlan,
        poe: poeOf(p, profiles),
      });
    }
  }

  const out: PortAssignment[] = [];
  let enriched = 0;
  let kept = 0;

  for (const row of existing) {
    const found = measured.get(`${row.device}#${row.idx}`);
    if (!found) {
      out.push(row);
      kept += 1;
      continue;
    }
    measured.delete(`${row.device}#${row.idx}`);

    /*
     * Only blanks are filled. A label the user wrote, a role they corrected
     * and a network they chose all survive the import untouched.
     *
     * A label that is only the controller's name for the socket counts as a
     * blank, though. Earlier imports wrote those in, and treating them as
     * something a person chose is what left a row reading "Port 3" for a
     * survey after survey that could see a machine on the other end of it.
     */
    const merged: PortAssignment = {
      ...row,
      /*
       * One kind of role is replaced rather than kept: an access port with no
       * network, where the survey measured what the port really is — the
       * gateway's WAN, or a link to another of the controller's own devices.
       *
       * Such a row cannot have been a choice, since an access port with no
       * network cannot be finished; it is what an earlier import left behind
       * before it could read the far end. Kept, it stayed an error for good:
       * a port between a switch and an access point, sitting on the
       * controller's "Default" profile, read as an access port with nothing
       * chosen, survey after survey, while the survey could see the access
       * point on the other end. A row somebody did give a network stays
       * exactly as they left it, and a role guessed only from a name is still
       * only a suggestion.
       */
      role:
        row.role === 'access' &&
        !row.nativeVlan &&
        found.role !== 'access' &&
        measuredRole.has(`${row.device}#${row.idx}`)
          ? found.role
          : row.role,
      label: ownName(row.label) || found.label || row.label,
      nativeVlan: row.nativeVlan || found.nativeVlan,
      poe: row.poe || found.poe,
    };
    const changed =
      merged.role !== row.role ||
      merged.label !== row.label ||
      merged.nativeVlan !== row.nativeVlan ||
      merged.poe !== row.poe;
    out.push(merged);
    if (changed) enriched += 1;
    else kept += 1;
  }

  const added = measured.size;
  const unused = [...measured.values()].filter((p) => p.role === 'unused').length;
  out.push(...measured.values());
  out.sort((a, b) => a.device.localeCompare(b.device) || a.idx - b.idx);

  return { ports: out, added, enriched, kept, unused, unmatched: [...unmatched.values()] };
}
