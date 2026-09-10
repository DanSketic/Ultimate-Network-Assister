/*
 * What the guided path's questions turn into.
 *
 * The interview writes a blueprint for somebody who cannot read one, so the
 * blueprint has to be right without being read. What is measured here is the
 * set of promises the questions make out loud:
 *
 *   - "no server" means no step anywhere in the plan is about a server;
 *   - "already in use" means nothing in the plan erases a disk, and the
 *     machines go onto the store the survey found;
 *   - "building it now" means the disks are prepared — by hand, never by us;
 *   - the address range and the Wi-Fi names are the ones the survey measured;
 *   - households that slug alike still get networks that do not collide;
 *   - nothing waits for a step that is not in the plan;
 *   - answering again edits the same plan rather than starting a second;
 *   - and a tick made in one language still counts in the other.
 */
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { rmSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const OUT = join(tmpdir(), 'interview-' + process.pid + '.mjs').replace(/\\/g, '/');

await build({
  stdin: {
    contents: `export { presets } from '${ROOT}/src/blueprint/registry';
               export { resolveBlueprint } from '${ROOT}/src/blueprint/resolve';
               export { buildPlan } from '${ROOT}/src/blueprint/plan';
               export { stepPrint } from '${ROOT}/src/blueprint/progress';
               export { blueprintFromAnswers, defaultAnswers, surveyFacts } from '${ROOT}/src/blueprint/interview';
               export { dict } from '${ROOT}/src/i18n/index';`,
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true, format: 'esm', outfile: OUT, platform: 'neutral',
  alias: { '@': `${ROOT}/src` }, logLevel: 'error',
  define: { __APP_VERSION__: '"0.0.0"' },
});
const { presets, resolveBlueprint, buildPlan, stepPrint, blueprintFromAnswers, defaultAnswers, surveyFacts, dict } =
  await import(`file://${OUT}`);

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '   ' + detail : ''}`);
  if (!ok) failures += 1;
};

const t = dict('en');
const all = presets('en');

/* ------------------------------------------------------------ a survey */

// A small estate, the shape the collectors return: a stock UniFi site on
// 10.0.1.0/24 with its Wi-Fi, and a Proxmox host on the same range.
const snapshot = {
  id: 's1', startedAt: '', finishedAt: '', log: [], errors: [],
  unifi: {
    site: 'default',
    devices: [], clients: [], firewallRules: [], portProfiles: [],
    networks: [
      { id: 'n0', name: 'Default', vlan: null, subnet: '10.0.1.1/24', purpose: 'corporate', enabled: true, dhcpEnabled: true },
      { id: 'n1', name: 'Cameras-old', vlan: 77, subnet: '10.0.77.1/24', purpose: 'corporate', enabled: true, dhcpEnabled: true },
    ],
    wlans: [
      { id: 'w0', name: 'Kovacs', enabled: true, security: 'wpapsk', networkId: 'n0', isGuest: false, ppskCount: 0 },
      { id: 'w1', name: 'Kovacs-Guest', enabled: true, security: 'open', networkId: 'n0', isGuest: true, ppskCount: 0 },
    ],
  },
  proxmox: {
    version: '8.2', nodes: [{ name: 'pve-home', status: 'online', cpuRatio: 0, cpuCount: 8, memUsed: 0, memTotal: 0, uptimeSecs: 0 }],
    storages: [
      { node: 'pve-home', name: 'local', kind: 'dir', total: 0, used: 0, available: 0, enabled: true, content: 'iso,vztmpl,backup', active: true },
      { node: 'pve-home', name: 'local-zfs', kind: 'zfspool', total: 0, used: 0, available: 0, enabled: true, content: 'images,rootdir', active: true },
    ],
    guests: [{ vmid: 105, name: 'homeassistant', kind: 'qemu', node: 'pve-home', status: 'running', cpuCount: 2, memTotal: 0, diskTotal: 0, tags: '' }],
    interfaces: [{ node: 'pve-home', name: 'vmbr0', kind: 'bridge', address: '10.0.1.20', cidr: '10.0.1.20/24', bridgePorts: 'eno1', vlanAware: false, active: true }],
    disks: [], backupJobs: [], backupJobsReadable: true, backupFiles: [], certificates: [], updates: [], updatesReadable: true,
  },
};

const facts = surveyFacts(snapshot, []);
check('the survey’s range is read', facts.prefix === '10.0', String(facts.prefix));
check('and its Wi-Fi names', facts.wifiName === 'Kovacs' && facts.guestWifiName === 'Kovacs-Guest');
check('and the store the server keeps machines on', facts.guestStore === 'local-zfs', String(facts.guestStore));
check('and what already looks to be running', /105/.test(facts.running['home-assistant'] ?? ''));

const answer = (patch, over = facts, snap = snapshot, base) =>
  blueprintFromAnswers({
    answers: { ...defaultAnswers(over, t), ...patch },
    facts: over,
    presets: all,
    snapshot: snap,
    t,
    ...(base ? { base } : {}),
  });

const errorsOf = (r) => r.resolved.issues.filter((i) => i.severity === 'error').map((i) => i.message);
const dangling = (r) => {
  const ids = new Set(r.plan.steps.map((s) => s.id));
  return r.plan.steps.flatMap((s) => s.requires.filter((id) => !ids.has(id)).map((id) => `${s.id} → ${id}`));
};
const onServer = (r) =>
  r.plan.steps.filter((s) => s.actions.some((a) => a.target === 'proxmox' || a.target === 'docker'));

/* --------------------------------------------------------- no server */

const flat = answer({ server: 'none' });
check('no server: resolves without an error', errorsOf(flat).length === 0, errorsOf(flat).join(' | '));
check('no server: no step in the plan is about a server', onServer(flat).length === 0,
  onServer(flat).map((s) => s.id).join(', '));
check('no server: nothing waits for a step that is not there', dangling(flat).length === 0, dangling(flat).join(', '));
check('no server: no firewall object names a hypervisor', !flat.resolved.addressObjects.some((a) => a.name === 'PVE-MGMT'));
check('the Wi-Fi keeps the name in use', flat.resolved.ssids.some((s) => s.name === 'Kovacs'));
check('every network is on the measured range',
  flat.resolved.networks.every((n) => n.cidr.startsWith('10.0.')),
  flat.resolved.networks.filter((n) => !n.cidr.startsWith('10.0.')).map((n) => n.cidr).join(', '));
check('a network the plan does not describe is named as left alone',
  flat.untouched.some((n) => n.name === 'Cameras-old'));
console.log(`   no server: ${flat.plan.steps.length} steps, ${flat.resolved.networks.length} networks`);

/* ---------------------------------------------------- a server in use */

const inUse = answer({ server: 'existing', services: ['adguard', 'nextcloud'] });
const destructive = inUse.plan.steps.filter((s) => s.actions.some((a) => a.destructive));
check('server in use: resolves without an error', errorsOf(inUse).length === 0, errorsOf(inUse).join(' | '));
check('server in use: nothing in the plan erases a disk', destructive.length === 0,
  destructive.map((s) => s.id).join(', '));
const creates = inUse.plan.steps.filter((s) => /guest-\d+$/.test(s.id));
check('server in use: machines go onto the store the survey found',
  creates.length > 0 && creates.every((s) => s.actions.some((a) => a.body.includes('local-zfs:'))),
  `${creates.length} machines`);
check('server in use: every guest address is on the measured range',
  inUse.resolved.guests.every((g) => !g.ip || g.ip.startsWith('10.0.')),
  inUse.resolved.guests.map((g) => g.ip).join(', '));
check('server in use: nothing waits for a step that is not there', dangling(inUse).length === 0, dangling(inUse).join(', '));

/* ------------------------------------------------ a server being built */

const fresh = answer({
  server: 'new',
  services: ['home-assistant', 'adguard', 'media', 'nextcloud', 'windows'],
  cameras: true,
  cameraCount: 3,
  remote: 'tunnel',
});
const pools = fresh.plan.steps.filter((s) => s.actions.some((a) => a.destructive));
check('new server: resolves without an error', errorsOf(fresh).length === 0, errorsOf(fresh).join(' | '));
check('new server: the disks are prepared', pools.length > 0, `${pools.length} steps`);
check('new server: and only ever by hand', pools.every((s) => s.capability === 'manual'),
  pools.filter((s) => s.capability !== 'manual').map((s) => s.id).join(', '));
check('new server: nothing waits for a step that is not there', dangling(fresh).length === 0, dangling(fresh).join(', '));
check('cameras get their network', fresh.resolved.networks.some((n) => n.role === 'cameras'));
console.log(`   new server, everything: ${fresh.plan.steps.length} steps, ${fresh.resolved.guests.length} machines`);

/* -------------------------------------------------- several households */

const several = answer({ homes: 'several', homeNames: ['A lakás', 'A-lakás', 'Emelet'], sharedPrinter: true });
const names = several.resolved.networks.map((n) => n.name);
const vlans = several.resolved.networks.map((n) => n.vlan);
check('several households: resolves without an error', errorsOf(several).length === 0, errorsOf(several).join(' | '));
check('households that slug alike still get distinct networks', new Set(names).size === names.length, names.join(', '));
check('and distinct VLANs', new Set(vlans).size === vlans.length);
check('every household gets its own client network',
  several.resolved.networks.filter((n) => n.role === 'household').length === 3);

/* ------------------------------------------------------ server only */

const hostFacts = surveyFacts({ ...snapshot, unifi: null }, []);
const host = answer({ server: 'existing', services: ['home-assistant', 'adguard'] }, hostFacts, { ...snapshot, unifi: null });
const hostCreates = host.plan.steps.filter((s) => /guest-\d+$/.test(s.id));
check('server only: the flat preset is chosen', host.blueprint.presetId === 'proxmox-host', host.blueprint.presetId);
check('server only: resolves without an error', errorsOf(host).length === 0, errorsOf(host).join(' | '));
check('server only: machines plug into vmbr0, untagged',
  hostCreates.length > 0 &&
    hostCreates.every((s) => s.actions.some((a) => /bridge=vmbr0[ ,\\]/.test(a.body) || /bridge=vmbr0$/.test(a.body))) &&
    hostCreates.every((s) => s.actions.every((a) => !/tag=/.test(a.body))),
  hostCreates.flatMap((s) => s.actions.map((a) => (a.body.match(/--net0 \S+/) ?? [''])[0])).filter(Boolean).join(' | '));
check('server only: nothing waits for a step that is not there', dangling(host).length === 0, dangling(host).join(', '));
check('server only: guests on the server’s own subnet',
  host.resolved.guests.every((g) => g.ip?.startsWith('10.0.1.')),
  host.resolved.guests.map((g) => g.ip).join(', '));

/* ------------------------------------------------------ answering again */

const withPorts = { ...flat.blueprint, ports: [{ id: 'p1', device: 'sw', idx: 3, label: 'Printer', role: 'access', nativeVlan: 0, poe: false }] };
const again = answer({ server: 'none', cameras: true }, facts, { ...snapshot, unifi: { ...snapshot.unifi } }, withPorts);
check('answering again keeps the same blueprint', again.blueprint.id === flat.blueprint.id);
check('and the labels typed onto ports', again.blueprint.ports.some((p) => p.label === 'Printer'));
check('an answer is recorded with its time', again.blueprint.interview?.answeredAt === again.blueprint.updatedAt);

/* ------------------------------------------ a tick across languages */

const huPreset = presets('hu').find((p) => p.id === fresh.blueprint.presetId);
const enPreset = all.find((p) => p.id === fresh.blueprint.presetId);
const huPlan = buildPlan(resolveBlueprint(fresh.blueprint, huPreset, dict('hu')), dict('hu'));
const enPlan = buildPlan(resolveBlueprint(fresh.blueprint, enPreset, t), t);
const enPrint = new Map(enPlan.steps.map((s) => [s.id, stepPrint(s)]));
const moved = huPlan.steps.filter((s) => enPrint.get(s.id) !== stepPrint(s)).map((s) => s.id);
check('a tick made in one language still counts in the other', moved.length === 0, moved.join(', '));

const renumbered = structuredClone(flat.blueprint);
renumbered.households[0].clientVlan = 13;
const before = new Map(flat.plan.steps.map((s) => [s.id, stepPrint(s)]));
const afterPlan = buildPlan(resolveBlueprint(renumbered, enPreset, t), t);
const changed = afterPlan.steps.filter((s) => before.has(s.id) && before.get(s.id) !== stepPrint(s)).map((s) => s.id);
check('and stops counting once the step itself changes', changed.includes('vlan-wifi.networks'), changed.join(', '));

/* ------------------------------------ the machines on the old default LAN */

// A stock estate: a switch with its uplink, and a desktop on the default LAN,
// which has no VLAN and so no counterpart in a plan that numbers everything.
const swPort = (idx, over = {}) => ({
  idx, name: `Port ${idx}`, up: true, enabled: true, speed: 1000, fullDuplex: true, poeEnabled: false,
  poePower: '', portConfId: '', taggedVlanMgmt: '', neighbourMac: '', neighbourName: '', neighbourPort: '',
  isUplink: false, ...over,
});
const wired = {
  ...snapshot,
  unifi: {
    ...snapshot.unifi,
    devices: [{
      mac: 'sw', name: 'Flex', model: 'USW-Flex-2.5G-8', kind: 'usw', state: 1, ip: '10.0.1.2', version: '',
      uptimeSecs: 0, clients: 1, uplinkMac: '', uplinkRemotePort: 0, uplinkLocalPort: 0, radios: [],
      ports: [swPort(1), swPort(8, { isUplink: true })],
    }],
    clients: [{
      mac: 'pc', hostname: 'desk-pc', ip: '10.0.1.50', network: 'Default', vlan: null, wired: true,
      apMac: '', oui: '', switchMac: 'sw', switchPort: 1,
    }],
  },
};

const oneHome = answer({ server: 'none' }, facts, wired);
check(
  'one household: a machine on the default LAN goes onto its network',
  oneHome.placed.length === 1 && oneHome.orphans.length === 0,
  `placed ${oneHome.placed.length}, unplaced ${oneHome.orphans.length}`,
);
check('and the plan has no port error left', errorsOf(oneHome).length === 0, errorsOf(oneHome).join(' | '));

const twoHomesAnswers = { server: 'none', homes: 'several', homeNames: ['Fent', 'Lent'] };
const twoHomes = answer(twoHomesAnswers, facts, wired);
check(
  'several households: which one it belongs to is asked, not guessed',
  twoHomes.placed.length === 0 && twoHomes.orphans.length === 1,
  `placed ${twoHomes.placed.length}, asked ${twoHomes.orphans.length}`,
);
const pc = twoHomes.orphans[0];
const lent = twoHomes.resolved.networks.find((n) => n.name === 'HOME-LENT');
const answeredPort = blueprintFromAnswers({
  answers: { ...defaultAnswers(facts, t), ...twoHomesAnswers },
  facts, presets: all, snapshot: wired, t,
  portNetworks: pc && lent ? { [pc.id]: lent.vlan } : {},
});
check(
  'and the answer lands on the port',
  !!lent && answeredPort.orphans.length === 0 &&
    answeredPort.blueprint.ports.find((p) => p.id === pc?.id)?.nativeVlan === lent.vlan,
  `${lent?.name} ${answeredPort.orphans.length}`,
);

rmSync(OUT, { force: true });
console.log(failures === 0 ? '\nOK' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
