import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
/*
 * The capacity panel's four states.
 *
 * The one that mattered: a Proxmox that answers everything except storage
 * figures used to produce an empty panel, which reads as the application
 * being broken rather than the token being short a permission.
 */
import { build } from 'esbuild';
import { rmSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const OUT = join(tmpdir(), 'cap-bundle-' + process.pid + '.mjs').replace(/\\/g, '/');
const DOUT = OUT.replace('cap-bundle', 'cap-dict');

for (const [entry, out] of [
  [`${ROOT}/src/survey/mapping.ts`, OUT],
  [`${ROOT}/src/i18n/index.ts`, DOUT],
]) {
  await build({ entryPoints: [entry], bundle: true, format: 'esm', outfile: out,
    platform: 'neutral', alias: { '@': `${ROOT}/src` }, logLevel: 'error' });
}
const { estateFromSnapshot } = await import(`file://${OUT}`);
const { dict } = await import(`file://${DOUT}`);
const hu = dict('hu');

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '   ' + detail : ''}`);
  if (!ok) failures += 1;
};

const node = { name: 'pve01', status: 'online', cpuRatio: 0.2, cpuCount: 8,
  memUsed: 8e9, memTotal: 32e9, uptimeSecs: 86400 };

const store = (over) => ({ node: 'pve01', name: 'local-lvm', kind: 'lvmthin', total: 0, used: 0,
  available: 0, enabled: true, content: 'images', active: false, ...over });

const snap = (storages, withPve = true) => ({
  id: 's', startedAt: '', finishedAt: '2026-08-13T09:00:00Z', log: [], errors: [],
  proxmox: withPve ? { version: '8.2', nodes: [node], storages, guests: [], interfaces: [],
    disks: [], backupJobs: [], backupFiles: [], certificates: [], updates: [], updatesReadable: false } : null,
  unifi: null,
});

const estate = (storages, withPve = true) => estateFromSnapshot(snap(storages, withPve), [], hu);

/* ------------------------------------------------------ figures came through */

const good = estate([store({ total: 1e12, used: 6e11, available: 4e11, active: true })]);
check('a store with figures gets a bar', good.capacity.some((c) => /local-lvm/.test(c.label)));
check('and no explanation is needed', good.capacityNote === undefined);
check('memory is always charted', good.capacity.some((c) => /pve01/.test(c.label)));

/* ------------------------------------------- listed, but with no figures */

const active = estate([store({ active: true })]);
check(
  'a sizeless store is listed rather than dropped',
  active.capacity.some((c) => /local-lvm/.test(c.label)),
  active.capacity.map((c) => c.label).join(' | '),
);
check(
  'and marked as not measured, never as a zero',
  active.capacity.find((c) => /local-lvm/.test(c.label))?.value === hu.findings.notMeasured,
);
check(
  'an active store with no figures points at the token',
  active.capacityNote === hu.findings.capacityActiveNoFigures,
);
check('which names the permission', /Datastore\.Audit/.test(active.capacityNote));

/* ---------------------------------- listed, no figures, activity unknown */

const unknown = estate([store({ active: false })]);
check(
  'without a positive activity reading it stays non-committal',
  unknown.capacityNote === hu.findings.capacityNoFigures,
);
check(
  'and does not claim the store is unmounted',
  !/nincs csatolva\b.*csak/.test(unknown.capacityNote ?? ''),
);

/* ---------------------------------------------------- no stores returned */

const none = estate([]);
check('an empty store list is explained', none.capacityNote === hu.findings.capacityNoStores);
check('naming the endpoint that filters', /nodes\/\{node\}\/storage/.test(none.capacityNote));

/* -------------------------------------------------------- no Proxmox at all */

const noPve = estate([], false);
check('with no Proxmox there is nothing to explain', noPve.capacityNote === undefined);
check('and no capacity at all', noPve.capacity.length === 0);

/* --------------------------------------------------------------- disabled */

const disabled = estate([store({ enabled: false })]);
check(
  'a store the administrator switched off is left out',
  !disabled.capacity.some((c) => /local-lvm/.test(c.label)),
);

/* ------------------------------------------------------------- old snapshot */

const legacy = estateFromSnapshot(
  { ...snap([]), proxmox: { version: '8.2', nodes: [node],
      // As a row stored before `active` and `content` existed would come back.
      storages: [{ node: 'pve01', name: 'tank', kind: 'zfs', total: 4e12, used: 1e12,
        available: 3e12, enabled: true }],
      guests: [], interfaces: [], disks: [], backupJobs: [], backupFiles: [], certificates: [], updates: [], updatesReadable: false } },
  [], hu,
);
check('an older snapshot still charts', legacy.capacity.some((c) => /tank/.test(c.label)));
check('with no spurious explanation', legacy.capacityNote === undefined);

rmSync(OUT, { force: true });
rmSync(DOUT, { force: true });
console.log(failures === 0 ? '\nOK' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
