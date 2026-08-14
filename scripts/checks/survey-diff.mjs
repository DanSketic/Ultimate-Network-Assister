/*
 * Comparing two surveys.
 *
 * The rule under test is the same one the rest of the application follows: a
 * difference may only be reported where both surveys measured the thing. A
 * source missing from one side is a fact about the survey, not about the
 * estate, and calling its contents "new" would be a claim nothing supports.
 */
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { rmSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const OUT = join(tmpdir(), 'diff-bundle-' + process.pid + '.mjs').replace(/\\/g, '/');
const DOUT = OUT.replace('diff-bundle', 'diff-dict');

for (const [entry, out] of [
  [`${ROOT}/src/survey/diff.ts`, OUT],
  [`${ROOT}/src/i18n/index.ts`, DOUT],
]) {
  await build({ entryPoints: [entry], bundle: true, format: 'esm', outfile: out,
    platform: 'neutral', alias: { '@': `${ROOT}/src` }, logLevel: 'error' });
}
const { diffSurveys } = await import(`file://${OUT}`);
const { dict } = await import(`file://${DOUT}`);
const hu = dict('hu');
const en = dict('en');

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '   ' + detail : ''}`);
  if (!ok) failures += 1;
};

/* ------------------------------------------------------------------ fixtures */

const port = (idx, over = {}) => ({
  idx, name: '', up: true, enabled: true, speed: 1000, fullDuplex: true, poeEnabled: false,
  poePower: '', portConfId: '', taggedVlanMgmt: '', neighbourMac: '', neighbourName: '',
  neighbourPort: '', isUplink: false, ...over,
});

const device = (mac, over = {}) => ({
  mac, name: mac.toUpperCase(), model: 'USW', kind: 'usw', state: 1, ip: `10.0.0.${mac.length}`,
  version: '6.6.0', uptimeSecs: 1000, clients: 0, uplinkMac: '', uplinkRemotePort: 0,
  uplinkLocalPort: 0, ports: [], radios: [], ...over,
});

const unifi = (over = {}) => ({
  site: 'default', devices: [], networks: [], wlans: [], firewallRules: [], clients: [],
  portProfiles: [], ...over,
});

const pve = (over = {}) => ({
  version: '8.2', nodes: [], storages: [], guests: [], interfaces: [], disks: [],
  backupJobs: [], backupFiles: [], certificates: [], updates: [], updatesReadable: false, ...over,
});

const snap = (id, over = {}) => ({
  id, startedAt: '', finishedAt: `2026-08-${id.padStart(2, '0')}T09:00:00Z`, log: [], errors: [],
  proxmox: null, unifi: null, ...over,
});

const of = (before, after, t = hu) => diffSurveys(before, after, t);
const whats = (d) => d.changes.map((c) => c.what);

/* -------------------------------------------------------- nothing to report */

const same = unifi({ devices: [device('aa')] });
check('an unchanged estate reports nothing', of(snap('1', { unifi: same }), snap('2', { unifi: same })).changes.length === 0);

/* ------------------------------------------------------------------ devices */

const gone = of(
  snap('1', { unifi: unifi({ devices: [device('aa'), device('bb')] }) }),
  snap('2', { unifi: unifi({ devices: [device('aa')] }) }),
);
check('a device that disappeared is reported', whats(gone).includes(hu.diff.deviceGone));

const offline = of(
  snap('1', { unifi: unifi({ devices: [device('aa', { state: 1 })] }) }),
  snap('2', { unifi: unifi({ devices: [device('aa', { state: 0 })] }) }),
);
check('a device that went unreachable is worst-first', offline.changes[0].what === hu.diff.deviceLost);
check('and marked bad', offline.changes[0].tone === 'bad');

const back = of(
  snap('1', { unifi: unifi({ devices: [device('aa', { state: 0 })] }) }),
  snap('2', { unifi: unifi({ devices: [device('aa', { state: 1 })] }) }),
);
check('coming back is good news, not a warning', back.changes[0].tone === 'good');

const firmware = of(
  snap('1', { unifi: unifi({ devices: [device('aa', { version: '6.6.0' })] }) }),
  snap('2', { unifi: unifi({ devices: [device('aa', { version: '7.0.1' })] }) }),
);
check('firmware shows both values', firmware.changes[0].detail === '6.6.0 → 7.0.1');

/* -------------------------------------------------------------------- ports */

const slower = of(
  snap('1', { unifi: unifi({ devices: [device('aa', { ports: [port(4, { speed: 1000 })] })] }) }),
  snap('2', { unifi: unifi({ devices: [device('aa', { ports: [port(4, { speed: 100 })] })] }) }),
);
check('a port that quietly slowed down is found', whats(slower).includes(hu.diff.portSlower));
check('and treated as bad', slower.changes[0].tone === 'bad', slower.changes[0].detail);

const faster = of(
  snap('1', { unifi: unifi({ devices: [device('aa', { ports: [port(4, { speed: 100 })] })] }) }),
  snap('2', { unifi: unifi({ devices: [device('aa', { ports: [port(4, { speed: 1000 })] })] }) }),
);
check('and speeding up is good', faster.changes[0].tone === 'good');

const downPort = of(
  snap('1', { unifi: unifi({ devices: [device('aa', { ports: [port(4)] })] }) }),
  snap('2', { unifi: unifi({ devices: [device('aa', { ports: [port(4, { up: false, speed: 0 })] })] }) }),
);
check('a port going down is reported once, not as a speed change too',
  downPort.changes.length === 1 && downPort.changes[0].what === hu.diff.portDown);

const newPort = of(
  snap('1', { unifi: unifi({ devices: [device('aa', { ports: [] })] }) }),
  snap('2', { unifi: unifi({ devices: [device('aa', { ports: [port(4)] })] }) }),
);
check('a port the earlier survey never saw is not called a change', newPort.changes.length === 0);

const moved = of(
  snap('1', { unifi: unifi({ devices: [device('aa', { ports: [port(4, { neighbourName: 'AP-1' })] })] }) }),
  snap('2', { unifi: unifi({ devices: [device('aa', { ports: [port(4, { neighbourName: 'AP-2' })] })] }) }),
);
check('a different device at the far end is worth a warning',
  moved.changes[0].what === hu.diff.neighbourChanged && moved.changes[0].tone === 'warn');

/* ------------------------------------------------------------ configuration */

const rule = (id, over = {}) => ({ id, name: `rule ${id}`, action: 'drop', ruleset: 'LAN_IN',
  index: 1, enabled: true, protocol: 'all', dstPort: '', src: '', dst: '', logging: false, ...over });

const ruleOff = of(
  snap('1', { unifi: unifi({ firewallRules: [rule('r1')] }) }),
  snap('2', { unifi: unifi({ firewallRules: [rule('r1', { enabled: false })] }) }),
);
check('a firewall rule switched off is a warning',
  ruleOff.changes[0].what === hu.diff.ruleOff && ruleOff.changes[0].tone === 'warn');

const wlan = (id, over = {}) => ({ id, name: `SSID ${id}`, enabled: true, security: 'wpa2',
  networkId: '', isGuest: false, ppskCount: 0, ...over });

const weaker = of(
  snap('1', { unifi: unifi({ wlans: [wlan('w1')] }) }),
  snap('2', { unifi: unifi({ wlans: [wlan('w1', { security: 'open' })] }) }),
);
check('a weakened SSID shows both modes', weaker.changes[0].detail === 'wpa2 → open');

/* ------------------------------------------------------------------ Proxmox */

const guest = (vmid, over = {}) => ({ vmid, name: `vm${vmid}`, kind: 'qemu', node: 'pve',
  status: 'running', cpuCount: 2, memTotal: 2e9, diskTotal: 8e9, tags: '', ...over });

const stopped = of(
  snap('1', { proxmox: pve({ guests: [guest(101)] }) }),
  snap('2', { proxmox: pve({ guests: [guest(101, { status: 'stopped' })] }) }),
);
check('a guest that stopped is reported', whats(stopped).includes(hu.diff.guestStopped));

const store = (name, used, total, over = {}) => ({ node: 'pve', name, kind: 'zfs', total, used,
  available: total - used, enabled: true, content: 'images', active: true, ...over });

const grew = of(
  snap('1', { proxmox: pve({ storages: [store('tank', 60, 100)] }) }),
  snap('2', { proxmox: pve({ storages: [store('tank', 92, 100)] }) }),
);
check('a store filling up is bad past 90%',
  grew.changes[0].what === hu.diff.storageGrew && grew.changes[0].tone === 'bad',
  grew.changes[0].detail);

const noise = of(
  snap('1', { proxmox: pve({ storages: [store('tank', 60, 100)] }) }),
  snap('2', { proxmox: pve({ storages: [store('tank', 62, 100)] }) }),
);
check('a two-point drift is not worth reporting', noise.changes.length === 0);

const file = (vmid) => ({ storage: 'backup', node: 'pve', volid: `v${vmid}`, vmid, ctime: 1,
  size: 1, protected: false, verification: '', notes: '' });

const lostBackup = of(
  snap('1', { proxmox: pve({ guests: [guest(101)], backupFiles: [file(101)] }) }),
  snap('2', { proxmox: pve({ guests: [guest(101)], backupFiles: [] }) }),
);
check('losing backup coverage is the worst kind of change',
  lostBackup.changes[0].what === hu.diff.backupLost && lostBackup.changes[0].tone === 'bad');

const gainedBackup = of(
  snap('1', { proxmox: pve({ guests: [guest(101)], backupFiles: [] }) }),
  snap('2', { proxmox: pve({ guests: [guest(101)], backupFiles: [file(101)] }) }),
);
check('gaining it is good', gainedBackup.changes[0].tone === 'good');

const disk = (health) => ({ node: 'pve', devpath: '/dev/sda', model: 'SSD', serial: 'x',
  size: 1e12, health, usedBy: 'tank' });

const failing = of(
  snap('1', { proxmox: pve({ disks: [disk('PASSED')] }) }),
  snap('2', { proxmox: pve({ disks: [disk('FAILED')] }) }),
);
check('a disk turning bad is reported', failing.changes[0].tone === 'bad', failing.changes[0].detail);

/* ------------------------------------- a source only one survey ever looked at */

const oneSided = of(
  snap('1', { unifi: unifi({ devices: [device('aa')] }) }),
  snap('2', { unifi: unifi({ devices: [device('aa')] }), proxmox: pve({ guests: [guest(101)] }) }),
);
check('a source only one survey covered is not compared', oneSided.changes.length === 0);
check('and the gap is stated', oneSided.notCompared.includes(hu.diff.proxmoxOneSided));

/* ------------------------------------------------------------------- output */

const both = of(
  snap('1', { unifi: unifi({ devices: [device('aa', { state: 1 }), device('bb')] }) }),
  snap('2', { unifi: unifi({ devices: [device('aa', { state: 0, version: '7.0' })] }) }),
);
const rank = { bad: 0, warn: 1, good: 2, info: 3 };
check('worst first', both.changes.every((c, i) => i === 0 || rank[both.changes[i - 1].tone] <= rank[c.tone]),
  both.changes.map((c) => c.tone).join(' → '));
check('both surveys are named in the result',
  both.from?.id === '1' && both.to.id === '2');

const english = of(
  snap('1', { unifi: unifi({ devices: [device('aa', { state: 1 })] }) }),
  snap('2', { unifi: unifi({ devices: [device('aa', { state: 0 })] }) }),
  en,
);
check('the rules do not depend on language', english.changes.length === offline.changes.length);
check('but the wording does', english.changes[0].what !== offline.changes[0].what,
  `${offline.changes[0].what} / ${english.changes[0].what}`);

rmSync(OUT, { force: true });
rmSync(DOUT, { force: true });
console.log(failures === 0 ? '\nOK' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
