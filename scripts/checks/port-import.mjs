/*
 * What the port layout gets out of a survey.
 *
 * The controller measures a port from three directions — LLDP, the uplink a
 * managed device reports, and the wired client it learned on the port — and
 * knows a fourth thing besides: what the port is *configured* as, through its
 * profile. An import that read only the port table produced rows with a number
 * and nothing else, which is the same work as typing them.
 *
 * What is checked here is that all four are used, that nothing is invented
 * where nothing was measured, that every port on the device comes in — a
 * layout showing 6 of a switch's 24 ports describes a switch nobody owns — and
 * — the one that matters on the second survey — that a hand-corrected row
 * survives being imported over.
 */
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { rmSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const OUT = join(tmpdir(), 'portimport-bundle-' + process.pid + '.mjs').replace(/\\/g, '/');

await build({
  stdin: {
    contents: `export { importPortsFromSurvey } from '${ROOT}/src/blueprint/importPorts';`,
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true, format: 'esm', outfile: OUT, platform: 'neutral',
  alias: { '@': `${ROOT}/src` }, logLevel: 'error',
});
const { importPortsFromSurvey } = await import(`file://${OUT}`);

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
  mac: 'sw', name: 'Switch', model: 'USW-24', kind: 'usw', state: 1, ip: '10.0.1.2',
  version: '6.0', uptimeSecs: 9000, clients: 4, uplinkMac: '', uplinkRemotePort: 0,
  uplinkLocalPort: 0, ports: [], radios: [], ...over,
});

const client = (over = {}) => ({
  mac: 'aa:bb', hostname: 'pve01', ip: '10.0.1.10', network: 'LAN', vlan: null, wired: true,
  apMac: '', oui: 'Intel', switchMac: 'sw', switchPort: 4, ...over,
});

const snapshot = (unifi) => ({
  id: 's', startedAt: '', finishedAt: '', log: [], errors: [], proxmox: null,
  unifi: { site: 'default', devices: [], networks: [], wlans: [], firewallRules: [],
    clients: [], portProfiles: [], ...unifi },
});

const NETWORKS = [
  { vlan: 1, name: 'MGMT', cidr: '10.0.1.0/24', gateway: '10.0.1.1', role: 'management', purpose: '', moduleId: 'core' },
  { vlan: 20, name: 'HOME', cidr: '10.0.20.0/24', gateway: '10.0.20.1', role: 'household', purpose: '', moduleId: 'core' },
];

const at = (result, idx) => result.ports.find((p) => p.idx === idx);

/* ------------------------------------------------- the three measured sources */

const lldp = importPortsFromSurvey(
  snapshot({ devices: [device({ ports: [port(1, { neighbourMac: 'ap1', neighbourName: 'AP-Hall' })] })] }),
  [], NETWORKS,
);
check('LLDP names the port', at(lldp, 1)?.label === 'AP-Hall', at(lldp, 1)?.label);
check('and the name decides the role', at(lldp, 1)?.role === 'ap', at(lldp, 1)?.role);

const uplink = importPortsFromSurvey(
  snapshot({
    devices: [
      device({ ports: [port(2)] }),
      device({ mac: 'ap1', name: 'AP-Kitchen', model: 'U6-Pro', kind: 'uap',
        uplinkMac: 'sw', uplinkRemotePort: 2, uplinkLocalPort: 1 }),
    ],
  }),
  [], NETWORKS,
);
check(
  'a device that reports its uplink names the parent’s port',
  at(uplink, 2)?.label === 'AP-Kitchen',
  at(uplink, 2)?.label,
);
check('and its kind gives the role, with no LLDP at all', at(uplink, 2)?.role === 'ap', at(uplink, 2)?.role);

const wired = importPortsFromSurvey(
  snapshot({ devices: [device({ ports: [port(4)] })], clients: [client()] }),
  [], NETWORKS,
);
check(
  'a machine the controller does not manage is named from the wired client',
  at(wired, 4)?.label === 'pve01',
  at(wired, 4)?.label,
);
check('and a Proxmox host reads as a server trunk', at(wired, 4)?.role === 'server', at(wired, 4)?.role);

/* --------------------------------------------- what the port is configured as */

const configured = importPortsFromSurvey(
  snapshot({
    devices: [device({ ports: [port(5, { portConfId: 'prof-home' })] })],
    networks: [{ id: 'net-home', name: 'HOME', vlan: 20, subnet: '10.0.20.0/24', purpose: 'corporate', enabled: true, dhcpEnabled: true }],
    portProfiles: [{ id: 'prof-home', name: 'HOME', forward: 'native', nativeNetworkId: 'net-home', taggedVlans: [], poeMode: 'auto', builtin: false }],
  }),
  [], NETWORKS,
);
check('the untagged VLAN comes from the port profile', at(configured, 5)?.nativeVlan === 20, String(at(configured, 5)?.nativeVlan));
check('and PoE from how the profile is set, not from what is drawing now', at(configured, 5)?.poe === true);

const unplanned = importPortsFromSurvey(
  snapshot({
    devices: [device({ ports: [port(5, { portConfId: 'prof-x' })] })],
    networks: [{ id: 'net-x', name: 'X', vlan: 99, subnet: '', purpose: '', enabled: true, dhcpEnabled: true }],
    portProfiles: [{ id: 'prof-x', name: 'X', forward: 'native', nativeNetworkId: 'net-x', taggedVlans: [], poeMode: 'off', builtin: false }],
  }),
  [], NETWORKS,
);
check(
  'a VLAN the target state does not have is not carried in',
  at(unplanned, 5)?.nativeVlan === 0,
  String(at(unplanned, 5)?.nativeVlan),
);

/*
 * The untagged default LAN, which is the case that made this necessary.
 *
 * A stock switch carries the "All" profile on every port, and that profile's
 * untagged network is the default LAN — a network the controller gives no VLAN
 * id at all. Matching on the number alone therefore answered "nothing
 * measured" for every port on the switch; the subnet says which network it is.
 */
const defaultLan = importPortsFromSurvey(
  snapshot({
    devices: [device({ ports: [port(8, { portConfId: 'prof-all' })] })],
    networks: [{ id: 'net-lan', name: 'Default', vlan: null, subnet: '10.0.1.0/24', purpose: 'corporate', enabled: true, dhcpEnabled: true }],
    portProfiles: [{ id: 'prof-all', name: 'All', forward: 'all', nativeNetworkId: 'net-lan', taggedVlans: [], poeMode: 'off', builtin: true }],
  }),
  [], NETWORKS,
);
check(
  'the untagged default LAN is matched by its subnet',
  at(defaultLan, 8)?.nativeVlan === 1,
  String(at(defaultLan, 8)?.nativeVlan),
);

/*
 * A plan is frequently a renumbering, and the port is still on the network the
 * plan describes — under a different number.
 */
const renumbered = importPortsFromSurvey(
  snapshot({
    devices: [device({ ports: [port(9, { portConfId: 'prof-home' })] })],
    networks: [{ id: 'net-home', name: 'HOME', vlan: 30, subnet: '192.168.30.0/24', purpose: 'corporate', enabled: true, dhcpEnabled: true }],
    portProfiles: [{ id: 'prof-home', name: 'HOME', forward: 'native', nativeNetworkId: 'net-home', taggedVlans: [], poeMode: 'off', builtin: false }],
  }),
  [], NETWORKS,
);
check(
  'a network the plan renumbered is matched by name',
  at(renumbered, 9)?.nativeVlan === 20,
  String(at(renumbered, 9)?.nativeVlan),
);

const nowhere = importPortsFromSurvey(
  snapshot({
    devices: [device({ ports: [port(10, { portConfId: 'prof-z' })] })],
    networks: [{ id: 'net-z', name: 'LAB', vlan: 88, subnet: '172.16.0.0/24', purpose: 'corporate', enabled: true, dhcpEnabled: true }],
    portProfiles: [{ id: 'prof-z', name: 'LAB', forward: 'native', nativeNetworkId: 'net-z', taggedVlans: [], poeMode: 'off', builtin: false }],
  }),
  [], NETWORKS,
);
check(
  'and a network the plan has no counterpart for is still left empty',
  at(nowhere, 10)?.nativeVlan === 0,
  String(at(nowhere, 10)?.nativeVlan),
);

/*
 * The address, which is the measurement that survives everything else being
 * renamed or renumbered — and the case a real controller produces most often,
 * where the port names no profile and the client no VLAN.
 */
const byAddress = importPortsFromSurvey(
  snapshot({
    devices: [device({ ports: [port(11, { portConfId: '' })] })],
    clients: [client({ switchPort: 11, hostname: 'printer', vlan: null, network: 'Default', ip: '10.0.20.50' })],
  }),
  [], NETWORKS,
);
check(
  'the network a client answered in places the port',
  at(byAddress, 11)?.nativeVlan === 20,
  String(at(byAddress, 11)?.nativeVlan),
);

const namedNetwork = importPortsFromSurvey(
  snapshot({
    devices: [device({ ports: [port(12, { portConfId: '' })] })],
    clients: [client({ switchPort: 12, hostname: 'printer', vlan: null, network: 'HOME', ip: '' })],
  }),
  [], NETWORKS,
);
check(
  'and with no address either, the network it names is the last resort',
  at(namedNetwork, 12)?.nativeVlan === 20,
  String(at(namedNetwork, 12)?.nativeVlan),
);

/* ------------------------------------------ what could not be placed is said */

check(
  'a network the plan has no counterpart for comes back whole, ready to be added',
  nowhere.unmatched.length === 1 &&
    nowhere.unmatched[0].name === 'LAB' &&
    nowhere.unmatched[0].vlan === 88 &&
    // The controller writes the range from the gateway's point of view; a
    // target state writes it from the network's.
    nowhere.unmatched[0].cidr === '172.16.0.0/24' &&
    // The controller stated the network address, not a gateway, so no gateway
    // is claimed: the usual .1 would be a guess written in as a measurement.
    nowhere.unmatched[0].gateway === '',
  JSON.stringify(nowhere.unmatched),
);
check(
  'and one that was placed is not',
  defaultLan.unmatched.length === 0,
  defaultLan.unmatched.join(','),
);

/* ------------------- the measurement survives the role being corrected later */

const trunkish = importPortsFromSurvey(
  snapshot({
    devices: [device({ ports: [port(13, { portConfId: 'prof-home' })] })],
    networks: [{ id: 'net-home', name: 'HOME', vlan: 20, subnet: '10.0.20.0/24', purpose: 'corporate', enabled: true, dhcpEnabled: true }],
    portProfiles: [{ id: 'prof-home', name: 'HOME', forward: 'native', nativeNetworkId: 'net-home', taggedVlans: [], poeMode: 'off', builtin: false }],
    clients: [{ mac: 'bb', hostname: 'nas01', ip: '10.0.20.9', network: 'HOME', vlan: 20, wired: true, apMac: '', oui: '', switchMac: 'sw', switchPort: 13 }],
  }),
  [], NETWORKS,
);
check(
  'a port suggested as something other than access still carries what was measured',
  at(trunkish, 13)?.role === 'server' && at(trunkish, 13)?.nativeVlan === 20,
  `${at(trunkish, 13)?.role} / ${at(trunkish, 13)?.nativeVlan}`,
);

const fromClient = importPortsFromSurvey(
  snapshot({ devices: [device({ ports: [port(6)] })], clients: [client({ switchPort: 6, hostname: 'printer', vlan: 20 })] }),
  [], NETWORKS,
);
check(
  'with no profile, the VLAN the client landed in is the measurement',
  at(fromClient, 6)?.nativeVlan === 20,
  String(at(fromClient, 6)?.nativeVlan),
);

/* ------------------------------------------------------- which ports get a row */

const mixed = importPortsFromSurvey(
  snapshot({
    devices: [device({ ports: [
      port(1, { neighbourName: 'AP-Hall' }),
      port(2, { up: false }),
      port(3, { up: false, enabled: false }),
      port(4, { up: false, neighbourName: 'AP-Attic' }),
      port(5, {}),
    ] })],
  }),
  [], NETWORKS,
);
check('every port on the device comes in', mixed.ports.length === 5, String(mixed.ports.length));
check('an empty dark port comes in as free', at(mixed, 2)?.role === 'unused', at(mixed, 2)?.role);
check('and free ports are counted as such', mixed.unused === 1, String(mixed.unused));
check(
  'free is not the same as switched off: a disabled port says so',
  at(mixed, 3)?.role === 'off',
  at(mixed, 3)?.role,
);
check('a dark port with something known on it is kept', at(mixed, 4)?.label === 'AP-Attic');
check(
  'and a port that is up with nothing named on it is not called free',
  at(mixed, 5)?.role === 'access',
  at(mixed, 5)?.role,
);
check(
  'a free port asks for no network, so it cannot be an error row',
  at(mixed, 2)?.nativeVlan === 0,
  String(at(mixed, 2)?.nativeVlan),
);

/* --------------------------------------- the controller's name for its own socket */

const socketNames = importPortsFromSurvey(
  snapshot({
    devices: [device({ ports: [
      port(20, { name: 'Port 20' }),
      port(21, { name: 'SFP+ 1', up: false }),
      port(22, { name: 'Nyomtato', up: false }),
    ] })],
  }),
  [], NETWORKS,
);
check(
  '"Port 20" is the switch naming its own socket, not a label',
  at(socketNames, 20)?.label === '',
  JSON.stringify(at(socketNames, 20)?.label),
);
check(
  'and a name somebody actually typed in the controller is kept',
  at(socketNames, 22)?.label === 'Nyomtato',
  at(socketNames, 22)?.label,
);

const stale = importPortsFromSurvey(
  snapshot({ devices: [device({ ports: [port(20, { neighbourName: 'AP-Pince' })] })] }),
  [{ id: 'p20', device: 'Switch', idx: 20, label: 'Port 20', role: 'access', nativeVlan: 20, poe: false }],
  NETWORKS,
);
check(
  'so a row left reading "Port 20" is filled by the next survey',
  stale.ports[0].label === 'AP-Pince',
  stale.ports[0].label,
);

const handwritten = importPortsFromSurvey(
  snapshot({ devices: [device({ ports: [port(20, { neighbourName: 'AP-Pince' })] })] }),
  [{ id: 'p20', device: 'Switch', idx: 20, label: 'a pince sarkában', role: 'access', nativeVlan: 20, poe: false }],
  NETWORKS,
);
check(
  'while a label somebody wrote is still never overwritten',
  handwritten.ports[0].label === 'a pince sarkában',
  handwritten.ports[0].label,
);

const trunkUnmatched = importPortsFromSurvey(
  snapshot({
    devices: [device({ ports: [port(30, { portConfId: 'prof-w', neighbourName: 'AP-Hall' })] })],
    networks: [{ id: 'net-w', name: 'WIFI-DEVICES', vlan: 14, subnet: '192.168.14.1/24', purpose: 'corporate', enabled: true, dhcpEnabled: true }],
    portProfiles: [{ id: 'prof-w', name: 'WIFI', forward: 'customize', nativeNetworkId: 'net-w', taggedVlans: [], poeMode: 'auto', builtin: false }],
  }),
  [], NETWORKS,
);
check(
  'a network the plan lacks is reported whatever role the port was given',
  trunkUnmatched.unmatched.map((n) => n.name).join(',') === 'WIFI-DEVICES',
  `${at(trunkUnmatched, 30)?.role}: ${trunkUnmatched.unmatched.map((n) => n.name).join(',')}`,
);
check(
  'and it arrives with the gateway the estate answers on',
  trunkUnmatched.unmatched[0]?.gateway === '192.168.14.1' &&
    trunkUnmatched.unmatched[0]?.cidr === '192.168.14.0/24' &&
    trunkUnmatched.unmatched[0]?.role === 'iot',
  JSON.stringify(trunkUnmatched.unmatched[0]),
);

/* ------------------------------------------------- the second survey costs nothing */

const corrected = [
  { id: 'p1', device: 'Switch', idx: 1, label: 'Hall AP, ceiling', role: 'ap', nativeVlan: 0, poe: true },
  { id: 'p9', device: 'Old switch', idx: 9, label: 'by hand', role: 'access', nativeVlan: 20, poe: false },
];
const again = importPortsFromSurvey(
  snapshot({
    devices: [device({ ports: [port(1, { neighbourName: 'AP-Hall' }), port(7, { neighbourName: 'nas' })] })],
  }),
  corrected, NETWORKS,
);
const kept = again.ports.find((p) => p.id === 'p1');
check('a corrected label survives the import', kept?.label === 'Hall AP, ceiling', kept?.label);
check('and so does the id, so the row is not replaced', kept !== undefined);
check('a row the survey never saw is left alone', again.ports.some((p) => p.id === 'p9'));
check('the new port is added', again.ports.some((p) => p.idx === 7), String(again.added));
check('and the count is of what changed', again.added === 1, `added ${again.added}, kept ${again.kept}`);

const blank = importPortsFromSurvey(
  snapshot({ devices: [device({ ports: [port(1, { neighbourName: 'AP-Hall', poeEnabled: true })] })] }),
  [{ id: 'p1', device: 'Switch', idx: 1, label: '', role: 'access', nativeVlan: 0, poe: false }],
  NETWORKS,
);
check('a blank label is filled from the survey', blank.ports[0].label === 'AP-Hall', blank.ports[0].label);
check('a role already chosen is not overwritten', blank.ports[0].role === 'access', blank.ports[0].role);
check('and the fill is counted as such', blank.enriched === 1, String(blank.enriched));

/* -------------------------------------------------------------- nothing to read */

const empty = importPortsFromSurvey(null, corrected, NETWORKS);
check('no survey leaves the layout exactly as it was', empty.ports === corrected && empty.added === 0);

console.log(`\n${failures === 0 ? 'all checks passed' : failures + ' failed'}`);
rmSync(OUT, { force: true });
process.exit(failures === 0 ? 0 : 1);
