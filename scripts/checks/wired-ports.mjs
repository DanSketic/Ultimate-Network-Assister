/*
 * Which port a machine the controller does not manage is plugged into.
 *
 * A Proxmox host is not a UniFi device: it has no uplink report, and a stock
 * install does not run `lldpd`, so the switch sees a port up at a speed with
 * nobody's name on it. The controller still learned the host's address on that
 * port, and reports it against the wired client — which is the only measured
 * source that reaches equipment it does not manage.
 *
 * What is checked is that the answer is used where it exists, and that nothing
 * is invented where it does not.
 */
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { rmSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const OUT = join(tmpdir(), 'wired-bundle-' + process.pid + '.mjs').replace(/\\/g, '/');

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

const gateway = (ports) => ({
  mac: 'gw', name: 'Gateway', model: 'UDM', kind: 'udm', state: 1, ip: '10.0.1.1', version: '3.0',
  uptimeSecs: 9000, clients: 4, uplinkMac: '', uplinkRemotePort: 0, uplinkLocalPort: 0,
  ports, radios: [],
});

const client = (over = {}) => ({
  mac: 'aa:bb', hostname: 'pve-host', ip: '10.0.1.10', network: 'LAN', vlan: null,
  wired: true, apMac: '', oui: 'Intel', switchMac: 'gw', switchPort: 4, ...over,
});

const snapshot = (over = {}) => ({
  id: 's', startedAt: '', finishedAt: '2026-08-14T09:00:00Z', log: [], errors: [],
  proxmox: {
    version: '8.2',
    nodes: [{ name: 'pve01', status: 'online', cpuRatio: 0.1, cpuCount: 8,
      memUsed: 8e9, memTotal: 32e9, uptimeSecs: 9000 }],
    storages: [], guests: [],
    interfaces: [{ node: 'pve01', name: 'vmbr0', kind: 'bridge', address: '10.0.1.10',
      cidr: '10.0.1.10/24', bridgePorts: 'eno1', vlanAware: false, active: true }],
    disks: [], backupJobs: [], backupFiles: [], certificates: [], updates: [],
    updatesReadable: false,
  },
  unifi: {
    site: 'default', devices: [gateway([port(4)])], networks: [], wlans: [],
    firewallRules: [], clients: [client()], portProfiles: [],
  },
  ...over,
});

const estateOf = (snap) => estateFromSnapshot(snap, [], hu);
const portOf = (estate, deviceName, idx) =>
  estate.nodes.find((n) => n.name === deviceName)?.ports?.find((p) => p.idx === idx);

/* ---------------------------------------- the controller knew all along */

const found = estateOf(snapshot());
check(
  'the port carries the Proxmox node’s own name',
  portOf(found, 'Gateway', 4)?.neighbour === 'pve01',
  portOf(found, 'Gateway', 4)?.neighbour,
);

/*
 * The cable into the host, and only that one.
 *
 * The host's own bridges are cards of their own now, and their ids carry the
 * node's name too — so matching on the name alone would pick up the line from
 * the host to its bridge and never look at the one being tested.
 */
const HOST = 'pve:pve01';
const intoHost = (links) => links.find((l) => (l.to === HOST || l.from === HOST) &&
  !l.from.startsWith('bridge:') && !l.to.startsWith('bridge:'));

const link = intoHost(found.links);
check('and the cable is drawn as measured, not inferred', link?.kind === 'physical', link?.kind);
check('with no inferred marker on it', !link?.provenance, String(link?.provenance));

/* ------------------------------------- nothing invented where nothing is known */

const noClient = estateOf(
  snapshot({
    unifi: { site: 'default', devices: [gateway([port(4)])], networks: [], wlans: [],
      firewallRules: [], clients: [], portProfiles: [] },
  }),
);
check('with no wired client the port stays unnamed', !portOf(noClient, 'Gateway', 4)?.neighbour);
const guess = intoHost(noClient.links);
check('and the cable falls back to a logical line', guess?.kind === 'logical');
check('marked as inferred', guess?.provenance === 'Becsült', String(guess?.provenance));

const wireless = estateOf(
  snapshot({
    unifi: { site: 'default', devices: [gateway([port(4)])], networks: [], wlans: [],
      firewallRules: [], clients: [client({ wired: false })], portProfiles: [] },
  }),
);
check('a wireless client never names a switch port', !portOf(wireless, 'Gateway', 4)?.neighbour);

const noPort = estateOf(
  snapshot({
    unifi: { site: 'default', devices: [gateway([port(4)])], networks: [], wlans: [],
      firewallRules: [], clients: [client({ switchPort: 0 })], portProfiles: [] },
  }),
);
check('a client with no port reported names nothing', !portOf(noPort, 'Gateway', 4)?.neighbour);

/* ------------------------------ the node the controller knows by another address */

/*
 * The address the controller learned is not always one the node's own
 * interface list carries: a node with several addresses, or one learned on a
 * different network than the one it reports, matches on neither. The name it
 * was given over DHCP is then the only thing tying the two together — and it
 * is nearly always the node's own name.
 *
 * Getting this wrong is not a small thing. The estate then draws its
 * hypervisor as an unnamed client hanging off a switch, invents a guessed line
 * from the gateway to the real host card beside it, and every arrangement pass
 * afterwards works from that: the switch the host is actually plugged into
 * ends up as far from it as the map allows.
 */
const byName = estateOf(
  snapshot({
    unifi: {
      site: 'default', devices: [gateway([port(4)])], networks: [], wlans: [],
      firewallRules: [],
      // Reported at an address the node's interfaces do not carry, under the
      // name the cluster knows it by.
      clients: [client({ ip: '10.9.9.9', hostname: 'pve01' })],
      portProfiles: [],
    },
  }),
);
check('a node learned at another address is still recognised by its name',
  portOf(byName, 'Gateway', 4)?.neighbour === 'pve01',
  portOf(byName, 'Gateway', 4)?.neighbour);

const namedLink = intoHost(byName.links);
check('and it gets its cable to the switch that learned it',
  namedLink?.kind === 'physical', `${namedLink?.kind} ${namedLink?.from} → ${namedLink?.to}`);
check('marked inferred, because the name is what tied them together',
  namedLink?.provenance === 'Becsült', String(namedLink?.provenance));
check('and it is not drawn a second time as a client',
  !byName.nodes.some((n) => n.kind === 'clients'),
  byName.nodes.filter((n) => n.kind === 'clients').map((n) => n.name).join(', '));

const domain = estateOf(
  snapshot({
    unifi: {
      site: 'default', devices: [gateway([port(4)])], networks: [], wlans: [],
      firewallRules: [],
      clients: [client({ ip: '10.9.9.9', hostname: 'pve01.otthon.lan' })],
      portProfiles: [],
    },
  }),
);
check('a domain suffix on the reported name does not hide it',
  portOf(domain, 'Gateway', 4)?.neighbour === 'pve01');

const stranger = estateOf(
  snapshot({
    unifi: {
      site: 'default', devices: [gateway([port(4)])], networks: [], wlans: [],
      firewallRules: [],
      clients: [client({ ip: '10.9.9.9', hostname: 'nas' })],
      portProfiles: [],
    },
  }),
);
check('but a machine with another name is not taken for the node',
  intoHost(stranger.links)?.kind === 'logical',
  String(intoHost(stranger.links)?.kind));

/* --------------------------------------------- other machines get named too */

const other = estateOf(
  snapshot({
    unifi: { site: 'default', devices: [gateway([port(4), port(6)])], networks: [], wlans: [],
      firewallRules: [],
      clients: [client(), client({ mac: 'cc', hostname: 'nas', ip: '10.0.1.50', switchPort: 6 })],
      portProfiles: [] },
  }),
);
check(
  'a machine that is not Proxmox is named by its hostname',
  portOf(other, 'Gateway', 6)?.neighbour === 'nas',
  portOf(other, 'Gateway', 6)?.neighbour,
);

/* ------------------------------------------------ LLDP still outranks it */

const lldp = estateOf(
  snapshot({
    unifi: {
      site: 'default',
      devices: [gateway([port(4, { neighbourName: 'announced-itself' })])],
      networks: [], wlans: [], firewallRules: [], clients: [client()], portProfiles: [],
    },
  }),
);
check(
  'what the far end announced wins over what was learned',
  portOf(lldp, 'Gateway', 4)?.neighbour === 'announced-itself',
  portOf(lldp, 'Gateway', 4)?.neighbour,
);

rmSync(OUT, { force: true });
console.log(failures === 0 ? '\nOK' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
