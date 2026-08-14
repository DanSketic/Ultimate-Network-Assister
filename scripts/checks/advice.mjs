import { fileURLToPath } from 'node:url';
/*
 * Drives the recommendation engine with made-up snapshots.
 *
 * The point is the honesty rules, not the wording: a plan may only appear when
 * something was measured, execution may never be reported as done, and a
 * restore point may only be claimed when a recent backup was actually found.
 */
import { build } from 'esbuild';
import { rmSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const OUT = new URL('./advice-bundle.mjs', import.meta.url).pathname.slice(1);

await build({
  entryPoints: [`${ROOT}/src/survey/advice.ts`],
  bundle: true,
  format: 'esm',
  outfile: OUT,
  platform: 'neutral',
  alias: { '@': `${ROOT}/src` },
  logLevel: 'error',
});
const { recommendationsFromSnapshot } = await import(`file://${OUT}`);

const DICT = await build({
  entryPoints: [`${ROOT}/src/i18n/index.ts`],
  bundle: true,
  format: 'esm',
  outfile: OUT.replace('advice-bundle', 'dict-bundle2'),
  platform: 'neutral',
  alias: { '@': `${ROOT}/src` },
  logLevel: 'error',
}).then(() => import(`file://${OUT.replace('advice-bundle', 'dict-bundle2')}`));

const hu = DICT.dict('hu');
const en = DICT.dict('en');

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '   ' + detail : ''}`);
  if (!ok) failures += 1;
};

const emptyBackups = {
  jobs: [], unprotected: [], guestCount: 0, protectedCount: 0,
  newestAgeDays: null, verifiable: false, stores: [],
};

const snap = (over = {}) => ({
  id: 's', startedAt: '', finishedAt: '2026-08-13T09:00:00Z', log: [], errors: [],
  proxmox: null, unifi: null, ...over,
});

const pve = (over = {}) => ({
  version: '8.2', nodes: [{ name: 'pve01', status: 'online', cpuRatio: 0.1, cpuCount: 8,
    memUsed: 1, memTotal: 10, uptimeSecs: 100 }],
  storages: [], guests: [], interfaces: [], disks: [], backupJobs: [], backupFiles: [], ...over,
});

const unifi = (over = {}) => ({
  site: 'default', devices: [], networks: [], wlans: [], firewallRules: [], clients: [],
  portProfiles: [], ...over,
});

/* ------------------------------------------------- nothing measured, nothing said */

check(
  'an empty survey advises nothing',
  recommendationsFromSnapshot(snap(), emptyBackups, hu).length === 0,
);

/* --------------------------------------------------------- guests with no backup */

const unprotected = recommendationsFromSnapshot(
  snap({ proxmox: pve({ storages: [{ node: 'pve01', name: 'backupstore', kind: 'dir', total: 1e12,
    used: 2e11, available: 8e11, enabled: true, content: 'backup,images' }] }) }),
  { ...emptyBackups, unprotected: [{ vmid: 101, name: 'gitlab' }, { vmid: 102, name: 'wiki' }],
    guestCount: 5, protectedCount: 3 },
  hu,
);
check('unprotected guests raise a plan', unprotected.length === 1);
check('it names how many', /2 vendéggép/.test(unprotected[0].title), unprotected[0].title);
check('and which ones', /gitlab, wiki/.test(unprotected[0].why));
check('severity is bad', unprotected[0].severity === 'bad');
check(
  'a store that takes backups makes the pre-check done',
  unprotected[0].steps[1].state === 'kész',
  unprotected[0].steps[1].text,
);

const noStore = recommendationsFromSnapshot(
  snap({ proxmox: pve() }),
  { ...emptyBackups, unprotected: [{ vmid: 101, name: 'gitlab' }], guestCount: 2, protectedCount: 1 },
  hu,
);
check(
  'no backup-capable store leaves the pre-check waiting',
  noStore[0].steps[1].state === 'vár',
  noStore[0].steps[1].text,
);

/* -------------------------------------------------------------- the checkpoint */

check(
  'a recent backup counts as a restore point',
  recommendationsFromSnapshot(
    snap({ unifi: unifi({ devices: [{ mac: 'a', name: 'AP', model: 'U6', kind: 'uap', state: 0,
      ip: '10.0.0.5', version: '', uptimeSecs: 0, clients: 0, uplinkMac: '', uplinkRemotePort: 0,
      uplinkLocalPort: 0, ports: [] }] }) }),
    { ...emptyBackups, newestAgeDays: 2 },
    hu,
  )[0].steps[2].state === 'kész',
);
check(
  'a stale backup does not',
  recommendationsFromSnapshot(
    snap({ unifi: unifi({ devices: [{ mac: 'a', name: 'AP', model: 'U6', kind: 'uap', state: 0,
      ip: '10.0.0.5', version: '', uptimeSecs: 0, clients: 0, uplinkMac: '', uplinkRemotePort: 0,
      uplinkLocalPort: 0, ports: [] }] }) }),
    { ...emptyBackups, newestAgeDays: 40 },
    hu,
  )[0].steps[2].state === 'vár',
);

/* ------------------------------------------------------------------- storage */

const storage = (used, total) =>
  recommendationsFromSnapshot(
    snap({ proxmox: pve({ storages: [{ node: 'pve01', name: 'tank', kind: 'zfs', total, used,
      available: total - used, enabled: true, content: 'images' }] }) }),
    emptyBackups, hu,
  );
check('92% storage is bad', storage(92, 100)[0]?.severity === 'bad');
check('84% storage is a warning', storage(84, 100)[0]?.severity === 'warn');
check('70% storage says nothing', storage(70, 100).length === 0);

/* --------------------------------------------------------------------- wi-fi */

const wifi = (security) =>
  recommendationsFromSnapshot(
    snap({ unifi: unifi({ wlans: [{ id: 'w1', name: 'Home', enabled: true, security,
      networkId: '', isGuest: false, ppskCount: 0 }] }) }),
    emptyBackups, hu,
  );
for (const mode of ['open', 'wep', 'WPA', 'wpa-personal'])
  check(`${mode} raises a plan`, wifi(mode).length === 1);
for (const mode of ['wpa2', 'wpa3', 'wpapsk2'])
  check(`${mode} does not`, wifi(mode).length === 0);
check(
  'a disabled weak SSID is left alone',
  recommendationsFromSnapshot(
    snap({ unifi: unifi({ wlans: [{ id: 'w1', name: 'Old', enabled: false, security: 'wep',
      networkId: '', isGuest: false, ppskCount: 0 }] }) }),
    emptyBackups, hu,
  ).length === 0,
);

/* ---------------------------------------------------------------- slow ports */

const port = (speed, neighbourName) => ({
  idx: 4, name: '', up: true, enabled: true, speed, fullDuplex: true, poeEnabled: false,
  poePower: '', portConfId: '', taggedVlanMgmt: '', neighbourMac: neighbourName ? 'bb' : '',
  neighbourName, neighbourPort: '', isUplink: false,
});
const withPort = (p) =>
  recommendationsFromSnapshot(
    snap({ unifi: unifi({ devices: [{ mac: 'a', name: 'USW', model: 'USW-24', kind: 'usw',
      state: 1, ip: '10.0.0.2', version: '', uptimeSecs: 0, clients: 0, uplinkMac: '',
      uplinkRemotePort: 0, uplinkLocalPort: 0, ports: [p] }] }) }),
    emptyBackups, hu,
  );
check('100 Mb/s to a known neighbour is worth chasing', withPort(port(100, 'AP-Loft')).length === 1);
check('100 Mb/s to an unknown neighbour is not', withPort(port(100, '')).length === 0);
check('a gigabit port is fine', withPort(port(1000, 'AP-Loft')).length === 0);
check('a down port is not reported', withPort({ ...port(0, 'AP-Loft'), up: false }).length === 0);

/* -------------------------------------------------------------------- bridge */

const bridge = (vlanAware, vlans) =>
  recommendationsFromSnapshot(
    snap({
      proxmox: pve({ interfaces: [{ node: 'pve01', name: 'vmbr0', kind: 'bridge', address: null,
        cidr: null, bridgePorts: 'eno1', vlanAware, active: true }] }),
      unifi: unifi({ networks: vlans.map((v, i) => ({ id: `n${i}`, name: `v${v}`, vlan: v,
        subnet: '', purpose: 'corporate', enabled: true, dhcpEnabled: true })) }),
    }),
    emptyBackups, hu,
  );
check('a plain bridge on a VLAN network raises a plan', bridge(false, [10, 20]).length === 1);
check('a VLAN-aware bridge does not', bridge(true, [10, 20]).length === 0);
check('nor does a plain bridge with no VLANs anywhere', bridge(false, []).length === 0);
check('and it carries a maintenance window', /Ablak/.test(bridge(false, [10]).at(0).duration));

/* ------------------------------------------------------- ordering and honesty */

const many = recommendationsFromSnapshot(
  snap({
    proxmox: pve({
      storages: [{ node: 'pve01', name: 'tank', kind: 'zfs', total: 100, used: 84,
        available: 16, enabled: true, content: 'images' }],
      interfaces: [{ node: 'pve01', name: 'vmbr0', kind: 'bridge', address: null, cidr: null,
        bridgePorts: 'eno1', vlanAware: false, active: true }],
    }),
    unifi: unifi({
      devices: [{ mac: 'a', name: 'AP', model: 'U6', kind: 'uap', state: 0, ip: '10.0.0.5',
        version: '', uptimeSecs: 0, clients: 0, uplinkMac: '', uplinkRemotePort: 0,
        uplinkLocalPort: 0, ports: [] }],
      networks: [{ id: 'n', name: 'v10', vlan: 10, subnet: '', purpose: 'corporate',
        enabled: true, dhcpEnabled: true }],
    }),
  }),
  emptyBackups, hu,
);
const rank = { bad: 0, warn: 1, info: 2 };
check(
  'worst first',
  many.every((r, i) => i === 0 || rank[many[i - 1].severity] <= rank[r.severity]),
  many.map((r) => r.severity).join(' → '),
);
check(
  'execution is never reported as done',
  many.every((r) => r.steps.slice(3).every((s) => s.state === 'vár')),
);
check('the survey step always is', many.every((r) => r.steps[0].state === 'kész'));
check('every plan says how to undo it', many.every((r) => r.steps.at(-1).text.length > 20));
check('ids are unique', new Set(many.map((r) => r.id)).size === many.length);

/* ------------------------------------------------------------------ language */

const huAll = recommendationsFromSnapshot(snap({ proxmox: pve({ storages: [{ node: 'p', name: 't',
  kind: 'zfs', total: 100, used: 95, available: 5, enabled: true, content: 'images' }] }) }),
  emptyBackups, hu);
const enAll = recommendationsFromSnapshot(snap({ proxmox: pve({ storages: [{ node: 'p', name: 't',
  kind: 'zfs', total: 100, used: 95, available: 5, enabled: true, content: 'images' }] }) }),
  emptyBackups, en);
check('the rules do not depend on language', huAll.length === enAll.length);
check('but the wording does', huAll[0].title !== enAll[0].title,
  `${huAll[0].title} / ${enAll[0].title}`);
check('and the ids do not', huAll[0].id === enAll[0].id);

rmSync(OUT, { force: true });
rmSync(OUT.replace('advice-bundle', 'dict-bundle2'), { force: true });
console.log(failures === 0 ? '\nOK' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
