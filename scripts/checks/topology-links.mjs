/*
 * Which cables the map draws, and on what evidence.
 *
 * The estate measures a link from three directions — the uplink a device
 * reports about itself, the LLDP neighbour its parent recorded, and the wired
 * client the controller learned on a port — and the map used to draw only the
 * first, plus one single cable to one single Proxmox host.
 *
 * What is checked here is that every measured cable reaches the map, that no
 * card is left floating with a path the survey plainly knows about, and that
 * measuring the same cable twice still draws one line.
 */
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { rmSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const OUT = join(tmpdir(), 'topolinks-bundle-' + process.pid + '.mjs').replace(/\\/g, '/');

await build({
  stdin: {
    contents: `export { estateFromSnapshot } from '${ROOT}/src/survey/mapping';
               export { dict } from '${ROOT}/src/i18n/index';`,
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true, format: 'esm', outfile: OUT, platform: 'neutral',
  alias: { '@': `${ROOT}/src` }, logLevel: 'error',
});
const { estateFromSnapshot, dict } = await import(`file://${OUT}`);
const hu = dict('hu');

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '   ' + detail : ''}`);
  if (!ok) failures += 1;
};

const port = (idx, over = {}) => ({
  idx, name: '', up: true, enabled: true, speed: 1000, fullDuplex: true, poeEnabled: false,
  poePower: '', portConfId: '', taggedVlanMgmt: '', neighbourMac: '', neighbourName: '',
  neighbourPort: '', isUplink: false, ...over,
});

const device = (over = {}) => ({
  mac: 'sw1', name: 'Switch', model: 'USW-24', kind: 'usw', state: 1, ip: '10.0.1.2',
  version: '6.0', uptimeSecs: 9000, clients: 2, uplinkMac: '', uplinkRemotePort: 0,
  uplinkLocalPort: 0, ports: [], radios: [], ...over,
});

const gateway = (over = {}) =>
  device({ mac: 'gw', name: 'Gateway', model: 'UDM-Pro', kind: 'udm', ip: '10.0.1.1', ...over });

const client = (over = {}) => ({
  mac: 'aa:bb', hostname: 'pve01', ip: '10.0.1.10', network: 'LAN', vlan: null, wired: true,
  apMac: '', oui: 'Intel', switchMac: 'sw1', switchPort: 4, ...over,
});

const node = (name, over = {}) => ({
  name, status: 'online', cpuRatio: 0.1, cpuCount: 8, memUsed: 8e9, memTotal: 32e9,
  uptimeSecs: 9000, ...over,
});

const iface = (nodeName, address, over = {}) => ({
  node: nodeName, name: 'vmbr0', kind: 'bridge', address, cidr: `${address}/24`,
  bridgePorts: 'eno1', vlanAware: false, active: true, ...over,
});

const guest = (vmid, over = {}) => ({
  vmid, name: `guest-${vmid}`, kind: 'lxc', node: 'pve01', status: 'running',
  cpuCount: 2, memTotal: 2e9, diskTotal: 8e9, tags: '', ...over,
});

const nic = (over = {}) => ({
  name: 'net0', model: 'veth', mac: 'AA:BB:CC:DD:EE:01', bridge: 'vmbr0', vlan: null,
  firewall: false, ...over,
});

const wan = (over = {}) => ({
  deviceMac: 'gw', name: 'WAN1', ifname: 'eth8', kind: 'dhcp', ip: '81.2.3.4',
  gatewayIp: '81.2.3.1', nameservers: ['1.1.1.1'], up: true, speed: 1000, uptimeSecs: 86400,
  isp: 'Telekom', latencyMs: 12, xputDown: 940, xputUp: 300, speedtestAt: 1756000000,
  portIdx: 9, ...over,
});

const snapshot = ({
  devices = [], clients = [], nodes = [], interfaces = [], wans = [], guests = [],
}) => ({
  id: 's', startedAt: '', finishedAt: '2026-08-24T09:00:00Z', log: [], errors: [],
  proxmox: nodes.length
    ? {
        version: '8.2', nodes, storages: [], guests, interfaces, disks: [],
        backupJobs: [], backupFiles: [], certificates: [], updates: [], updatesReadable: false,
      }
    : null,
  unifi: { site: 'default', devices, networks: [], wlans: [], firewallRules: [], clients,
    portProfiles: [], wans },
});

const linksOf = (snap) => estateFromSnapshot(snap, [], hu).links;
const nodesOf = (snap) => estateFromSnapshot(snap, [], hu).nodes;
const between = (links, a, b) =>
  links.filter(
    (l) => (l.from.includes(a) && l.to.includes(b)) || (l.from.includes(b) && l.to.includes(a)),
  );

/* ------------------------------------------------ the cable LLDP alone saw */

const lldpOnly = linksOf(
  snapshot({
    devices: [
      gateway({ ports: [port(1, { neighbourMac: 'sw1', neighbourName: 'Switch' })] }),
      // Dropped off the controller: it reports no uplink of its own.
      device({ state: 0, uplinkMac: '' }),
    ],
  }),
);
const seen = between(lldpOnly, 'gw', 'sw1');
check('a cable only LLDP saw is drawn', seen.length === 1, String(seen.length));
check('and it is measured, not inferred', seen[0]?.kind === 'physical' && !seen[0]?.provenance);

/* ------------------------------------------------------- measured twice, drawn once */

const both = linksOf(
  snapshot({
    devices: [
      gateway({ ports: [port(1, { neighbourMac: 'sw1' })] }),
      device({ uplinkMac: 'gw', uplinkRemotePort: 1, uplinkLocalPort: 9 }),
    ],
  }),
);
check('the same cable measured twice is one line', between(both, 'gw', 'sw1').length === 1,
  String(between(both, 'gw', 'sw1').length));

/* ----------------------------------------------------------- every host, its own cable */

const cluster = linksOf(
  snapshot({
    devices: [gateway(), device({ uplinkMac: 'gw', uplinkRemotePort: 1 })],
    nodes: [node('pve01'), node('pve02')],
    interfaces: [iface('pve01', '10.0.1.10'), iface('pve02', '10.0.1.11')],
    clients: [
      client({ ip: '10.0.1.10', switchMac: 'sw1', switchPort: 4 }),
      client({ mac: 'cc:dd', hostname: 'pve02', ip: '10.0.1.11', switchMac: 'sw1', switchPort: 5 }),
    ],
  }),
);
check('the second cluster node is not left floating', between(cluster, 'sw1', 'pve02').length === 1);
check('and each node is wired where it was actually learned',
  between(cluster, 'sw1', 'pve01')[0]?.kind === 'physical');

const crossed = linksOf(
  snapshot({
    devices: [gateway(), device({ uplinkMac: 'gw', uplinkRemotePort: 1 })],
    nodes: [node('pve01'), node('pve02')],
    interfaces: [iface('pve01', '10.0.1.10'), iface('pve02', '10.0.1.11')],
    // Only the first host was learned; the second has no measurement at all.
    clients: [client({ ip: '10.0.1.10' })],
  }),
);
check('a host nobody learned falls back to a logical line',
  between(crossed, 'gw', 'pve02')[0]?.kind === 'logical');
check('marked as inferred', between(crossed, 'gw', 'pve02')[0]?.provenance === 'Becsült');
check('and it is not attributed to another host’s address',
  between(crossed, 'sw1', 'pve02').length === 0);

/* ------------------------------------------------------------ two NICs, two cables */

const dual = linksOf(
  snapshot({
    devices: [
      gateway(),
      device({ uplinkMac: 'gw', uplinkRemotePort: 1 }),
      device({ mac: 'sw2', name: 'Switch B', uplinkMac: 'gw', uplinkRemotePort: 2 }),
    ],
    nodes: [node('pve01')],
    interfaces: [iface('pve01', '10.0.1.10'), { ...iface('pve01', '10.0.2.10'), name: 'vmbr1' }],
    clients: [
      client({ ip: '10.0.1.10', switchMac: 'sw1', switchPort: 4 }),
      client({ mac: 'ee:ff', ip: '10.0.2.10', switchMac: 'sw2', switchPort: 4 }),
    ],
  }),
);
check('a host on two switches gets both cables',
  between(dual, 'sw1', 'pve01').length === 1 && between(dual, 'sw2', 'pve01').length === 1);

/* --------------------------------------------------- the wired clients reach the map */

const wired = linksOf(
  snapshot({
    devices: [gateway(), device({ uplinkMac: 'gw', uplinkRemotePort: 1 })],
    clients: [client({ mac: 'ca:m1', hostname: 'camera-1', ip: '10.0.30.5', switchPort: 7 })],
  }),
);
const bubble = between(wired, 'sw1', 'clients');
check('a wired-only estate still links the client bubble', bubble.length === 1, String(bubble.length));
check('and the aggregation is marked inferred', bubble[0]?.provenance === 'Becsült');

const managedOnly = linksOf(
  snapshot({
    devices: [gateway(), device({ uplinkMac: 'gw', uplinkRemotePort: 1 })],
    // The switch itself is reported as a wired client of the gateway; it has
    // its own card, so it must not also be counted into the bubble.
    clients: [client({ mac: 'sw1', hostname: 'Switch', ip: '10.0.1.2', switchMac: 'gw', switchPort: 1 })],
  }),
);
check('a device that has its own card is not counted into the bubble',
  between(managedOnly, 'gw', 'clients').length === 0);

const hostOnly = linksOf(
  snapshot({
    devices: [gateway(), device({ uplinkMac: 'gw', uplinkRemotePort: 1 })],
    nodes: [node('pve01')],
    interfaces: [iface('pve01', '10.0.1.10')],
    clients: [client({ ip: '10.0.1.10' })],
  }),
);
check('nor is the Proxmox host, which has its own cable',
  between(hostOnly, 'sw1', 'clients').length === 0 && between(hostOnly, 'sw1', 'pve01').length === 1);

/* ------------------------------------------------- what the guests are plugged into */

const virtual = snapshot({
  devices: [gateway()],
  nodes: [node('pve01')],
  interfaces: [iface('pve01', '10.0.1.10', { vlanAware: true })],
  guests: [guest(101, { nics: [nic({ vlan: 20 })] })],
});
const bridgeCard = nodesOf(virtual).find((n) => n.kind === 'bridge');
check('a bridge is a card of its own', bridgeCard?.name === 'vmbr0', bridgeCard?.name);
check('carrying the port it hangs off', bridgeCard?.subtitle.includes('eno1') === true,
  bridgeCard?.subtitle);
check('the host is wired to its bridge',
  between(linksOf(virtual), 'pve:pve01', 'bridge:pve01:vmbr0').length === 1);
check('and the guest hangs off the bridge, not off the host',
  between(linksOf(virtual), 'bridge:pve01:vmbr0', 'guest:101').length === 1 &&
    between(linksOf(virtual), 'pve:pve01', 'guest:101').length === 0);

const guestCard = nodesOf(virtual).find((n) => n.id === 'guest:101');
const attached = guestCard?.facts.find((f) => f.key === hu.findings.factAttached);
check('the guest card says which bridge and which VLAN',
  attached?.value === 'vmbr0 · 20', attached?.value);

const named = nodesOf({
  ...virtual,
  unifi: {
    ...virtual.unifi,
    networks: [{ id: 'n1', name: 'HOME', vlan: 20, subnet: '10.0.20.0/24', purpose: '',
      enabled: true, dhcpEnabled: true }],
  },
}).find((n) => n.id === 'guest:101');
check('and names the VLAN where the controller knows it',
  named?.facts.find((f) => f.key === hu.findings.factAttached)?.value === 'vmbr0 · 20 · HOME',
  named?.facts.find((f) => f.key === hu.findings.factAttached)?.value);

/*
 * The config could not be read, or the survey predates reading it. The guest
 * still runs on that host and nothing measured says more than that.
 */
const unread = snapshot({
  devices: [gateway()],
  nodes: [node('pve01')],
  interfaces: [iface('pve01', '10.0.1.10')],
  guests: [guest(102)],
});
check('a guest with no config read keeps its line to the host',
  between(linksOf(unread), 'pve:pve01', 'guest:102').length === 1);
check('and says the attachment was not measured',
  nodesOf(unread).find((n) => n.id === 'guest:102')?.facts
    .find((f) => f.key === hu.findings.factAttached)?.value === hu.findings.notMeasured);

/*
 * A tag on a bridge that does not know about VLANs is simply not applied: the
 * guest lands on the bridge's own network and nothing anywhere says so.
 */
const silentlyUntagged = nodesOf(
  snapshot({
    devices: [gateway()],
    nodes: [node('pve01')],
    interfaces: [iface('pve01', '10.0.1.10', { vlanAware: false })],
    guests: [guest(103, { nics: [nic({ vlan: 30 })] })],
  }),
).find((n) => n.kind === 'bridge');
check('a tagged guest on a bridge that is not VLAN-aware is called out',
  silentlyUntagged?.warnings.some((w) => w.severity === 'bad') === true,
  JSON.stringify(silentlyUntagged?.warnings));

const plain = nodesOf(
  snapshot({
    devices: [gateway()],
    nodes: [node('pve01')],
    interfaces: [iface('pve01', '10.0.1.10', { vlanAware: false })],
    guests: [guest(104, { nics: [nic()] })],
  }),
).find((n) => n.kind === 'bridge');
check('an untagged guest on the same bridge is not', plain?.warnings.length === 0);

const twoBridges = snapshot({
  devices: [gateway()],
  nodes: [node('pve01')],
  interfaces: [
    iface('pve01', '10.0.1.10'),
    { ...iface('pve01', '10.0.2.10'), name: 'vmbr1' },
  ],
  guests: [guest(105, { nics: [nic(), nic({ name: 'net1', bridge: 'vmbr1' })] })],
});
check('a guest with two interfaces is drawn on both bridges',
  between(linksOf(twoBridges), 'bridge:pve01:vmbr0', 'guest:105').length === 1 &&
    between(linksOf(twoBridges), 'bridge:pve01:vmbr1', 'guest:105').length === 1);

/* ----------------------------------------------- the clients, where they are */

const wireless = (mac, ap, over = {}) => ({
  mac, hostname: `dev-${mac}`, ip: `10.0.10.${mac.length}`, network: 'LAN', vlan: 10,
  wired: false, apMac: ap, oui: 'Apple', switchMac: '', switchPort: 0, ...over,
});

const perDevice = snapshot({
  devices: [
    gateway(),
    device({ uplinkMac: 'gw', uplinkRemotePort: 1 }),
    device({ mac: 'ap1', name: 'AP one', kind: 'uap', uplinkMac: 'sw1', uplinkRemotePort: 5 }),
    device({ mac: 'ap2', name: 'AP two', kind: 'uap', uplinkMac: 'sw1', uplinkRemotePort: 6 }),
  ],
  clients: [
    wireless('c1', 'ap1'),
    wireless('c2', 'ap1'),
    wireless('c3', 'ap2'),
    client({ mac: 'c4', hostname: 'nas', ip: '10.0.40.9', switchMac: 'sw1', switchPort: 11 }),
  ],
});

const cards = nodesOf(perDevice).filter((n) => n.kind === 'clients');
check('clients are grouped by the device that reports them', cards.length === 3,
  cards.map((c) => c.id).join(', '));
check('with the count of that device only',
  cards.find((c) => c.id === 'clients:ap1')?.facts.find((f) => f.key === hu.findings.factTotal)?.value === '2',
  cards.find((c) => c.id === 'clients:ap1')?.facts.find((f) => f.key === hu.findings.factTotal)?.value);
check('and the machines named on the card',
  cards.find((c) => c.id === 'clients:ap1')?.services.some((s) => s.name === 'dev-c1') === true);
check('each hangs off its own device',
  between(linksOf(perDevice), 'unifi:ap1', 'clients:ap1').length === 1 &&
    between(linksOf(perDevice), 'unifi:ap2', 'clients:ap2').length === 1);
check('the wireless ones on a wireless line, the wired ones on a cable',
  between(linksOf(perDevice), 'unifi:ap1', 'clients:ap1')[0]?.kind === 'wireless' &&
    between(linksOf(perDevice), 'unifi:sw1', 'clients:sw1')[0]?.kind === 'physical');
check('and the grouping is marked inferred, because the line stands for several',
  between(linksOf(perDevice), 'unifi:ap1', 'clients:ap1')[0]?.provenance === 'Becsült');

/*
 * A device is not a client of another device, and neither is the hypervisor:
 * both have cards of their own, and counting them again would draw the same
 * machine twice.
 */
const noDoubles = snapshot({
  devices: [gateway(), device({ uplinkMac: 'gw', uplinkRemotePort: 1 })],
  nodes: [node('pve01')],
  interfaces: [iface('pve01', '10.0.1.10')],
  clients: [
    client({ ip: '10.0.1.10' }),
    client({ mac: 'sw1', hostname: 'Switch', ip: '10.0.1.2', switchMac: 'gw', switchPort: 1 }),
  ],
});
check('a device and the hypervisor are not counted as clients of anything',
  nodesOf(noDoubles).filter((n) => n.kind === 'clients').length === 0);

/*
 * The controller knows of a machine but not where it is. It is somewhere
 * behind the gateway and nothing measured says more, so it is kept apart
 * rather than folded in with the placed ones.
 */
const stray = snapshot({
  devices: [gateway()],
  clients: [wireless('c9', '')],
});
const strayCards = nodesOf(stray).filter((n) => n.kind === 'clients');
check('a client the controller could not place gets a card of its own',
  strayCards.length === 1 && strayCards[0]?.id === 'clients');
check('joined to the gateway by an inferred line',
  between(linksOf(stray), 'gw', 'clients')[0]?.kind === 'logical' &&
    between(linksOf(stray), 'gw', 'clients')[0]?.provenance === 'Becsült');

/* ------------------------------------------- what lives behind the hypervisor */

/*
 * A guest on a bridge has its own address on the wire, so the controller
 * learns it on whatever port the host is plugged into and reports it as a
 * client of that switch. Drawn as one, it hangs off the switch — a path going
 * round the machine it actually runs on, which is not how any of it is wired.
 */
const behind = snapshot({
  devices: [gateway(), device({ uplinkMac: 'gw', uplinkRemotePort: 1 })],
  nodes: [node('pve01')],
  interfaces: [iface('pve01', '10.0.1.10')],
  guests: [guest(101, { nics: [nic({ mac: 'AA:BB:CC:00:01:02' })] })],
  clients: [
    // The host itself, on port 4.
    client({ ip: '10.0.1.10', switchPort: 4 }),
    // The guest, on the same port, with the MAC its own config gives it.
    client({ mac: 'AA:BB:CC:00:01:02', hostname: 'guest-101', ip: '10.0.1.50', switchPort: 4 }),
    // Another machine behind the host whose config could not be read.
    client({ mac: 'DE:AD:00:00:00:01', hostname: 'vm-unknown', ip: '10.0.1.51', switchPort: 4 }),
    // And a real client of the switch, on a port of its own.
    client({ mac: 'CA:FE:00:00:00:01', hostname: 'nas', ip: '10.0.1.60', switchPort: 7 }),
  ],
});

const behindCards = nodesOf(behind).filter((n) => n.kind === 'clients');
check('a guest is not also drawn as a client of the switch',
  behindCards.length === 1 && behindCards[0]?.facts.find((f) => f.key === hu.findings.factTotal)?.value === '1',
  behindCards.map((c) => `${c.id}:${c.facts.find((f) => f.key === hu.findings.factTotal)?.value}`).join(', '));
check('and neither is anything else on the host’s own port',
  !behindCards[0]?.services.some((s) => /vm-unknown/.test(s.name)),
  behindCards[0]?.services.map((s) => s.name).join(', '));
check('while a machine on another port of the same switch still is',
  behindCards[0]?.services.some((s) => s.name === 'nas') === true);
check('so the guest reaches the network through its bridge, not around the host',
  between(linksOf(behind), 'bridge:pve01:vmbr0', 'guest:101').length === 1 &&
    between(linksOf(behind), 'unifi:sw1', 'guest:101').length === 0);

/* ------------------------------------------------------------------- the way out */

const outside = snapshot({ devices: [gateway()], wans: [wan()] });
const wanCard = nodesOf(outside).find((n) => n.kind === 'cloud');
check('the way out is on the map', wanCard !== undefined);
check('named after the provider, not after the interface', wanCard?.name === 'Telekom', wanCard?.name);
check('and it sits outside every VLAN', wanCard?.zone === 'WAN', wanCard?.zone);
const cable = between(linksOf(outside), 'wan:eth8', 'gw');
check('with a measured cable to the gateway that reports it',
  cable.length === 1 && cable[0]?.kind === 'physical');

const dead = snapshot({ devices: [gateway()], wans: [wan({ up: false })] });
const deadCard = nodesOf(dead).find((n) => n.kind === 'cloud');
check('a link that carries nothing is drawn as broken',
  between(linksOf(dead), 'wan:eth8', 'gw')[0]?.kind === 'broken');
check('and says so on the card', deadCard?.status === 'bad' && deadCard?.warnings.length === 1);

const twoIsps = nodesOf(
  snapshot({
    devices: [gateway()],
    wans: [wan(), wan({ name: 'WAN2', ifname: 'eth9', ip: '10.64.0.7', isp: 'Vodafone', up: false })],
  }),
).filter((n) => n.kind === 'cloud');
check('two providers are two cards', twoIsps.length === 2, String(twoIsps.length));

const unmeasured = nodesOf(
  snapshot({
    devices: [gateway()],
    wans: [wan({ isp: '', latencyMs: -1, xputDown: -1, xputUp: -1, speedtestAt: -1 })],
  }),
).find((n) => n.kind === 'cloud');
check('an unmeasured link says so rather than reading as zero',
  unmeasured?.metrics[0]?.value === hu.findings.notMeasured, unmeasured?.metrics[0]?.value);
check('and falls back to a plain name', unmeasured?.name === hu.findings.internet, unmeasured?.name);

/*
 * The controller's health summary knows there is a way out and does not say
 * which gateway carries it. A card floating beside the gateway that plainly
 * holds that very address reads as a fault in the map, so it is attributed —
 * and marked inferred, because attributing it is a conclusion.
 */
const byAddress = snapshot({
  devices: [gateway({ ip: '81.2.3.4' }), device({ mac: 'gw2', name: 'Gateway B', kind: 'udm',
    ip: '10.0.9.1' })],
  wans: [wan({ deviceMac: '', ifname: '' })],
});
const attributed = between(linksOf(byAddress), 'wan:WAN1', 'gw');
check('a link only the health summary saw reaches the gateway holding its address',
  attributed.length === 1, String(attributed.length));
check('and the attribution is marked inferred', attributed[0]?.provenance === 'Becsült');
check('while the other gateway is left out of it',
  between(linksOf(byAddress), 'wan:WAN1', 'gw2').length === 0);

const onlyOne = snapshot({ devices: [gateway({ ip: '10.0.1.1' })], wans: [wan({ deviceMac: '' })] });
check('with one gateway and no matching address it is still attributed',
  between(linksOf(onlyOne), 'wan:eth8', 'gw')[0]?.provenance === 'Becsült');

const twoGateways = snapshot({
  devices: [gateway({ ip: '10.0.1.1' }), device({ mac: 'gw2', name: 'Gateway B', kind: 'udm',
    ip: '10.0.9.1' })],
  wans: [wan({ deviceMac: '', ip: '' })],
});
check('but with two gateways and nothing to match on, nothing is guessed',
  linksOf(twoGateways).filter((l) => l.from.startsWith('wan:') || l.to.startsWith('wan:')).length === 0);

/*
 * A link the controller reported with no interface name at all. The card and
 * the cable used to build their id in two places, and this is the case where
 * the two disagreed — the card was drawn, the cable was dropped.
 */
const unnamed = snapshot({
  devices: [gateway()],
  wans: [wan({ ifname: '', name: '' })],
});
const unnamedCard = nodesOf(unnamed).find((n) => n.kind === 'cloud');
check('a link with no interface name still gets its cable',
  linksOf(unnamed).some((l) => l.from === unnamedCard?.id || l.to === unnamedCard?.id),
  unnamedCard?.id);

const noWan = snapshot({ devices: [gateway()] });
check('an estate with no WAN measured gets no card',
  !nodesOf(noWan).some((n) => n.kind === 'cloud'));

/* -------------------------------------------------- a survey taken before all this */

const older = snapshot({ devices: [gateway()] });
delete older.unifi.wans;
check('a kept survey with no WAN field still maps', nodesOf(older).length > 0);

console.log(`\n${failures === 0 ? 'all checks passed' : failures + ' failed'}`);
rmSync(OUT, { force: true });
process.exit(failures === 0 ? 0 : 1);
