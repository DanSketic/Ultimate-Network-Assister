/*
 * What a green light on a connection profile is allowed to mean.
 *
 * It used to mean "the certificate was accepted" while reading as "the machine
 * is fine", so a host that was switched off showed green and the survey was
 * started against it. The rule measured here is that green is a measurement
 * and nothing else: no combination of accepted fingerprints, filled-in
 * addresses or stored secrets can produce it without a connect that succeeded,
 * and a connect that failed always shows red.
 *
 * Also measured: which socket each profile's light is about, so the Proxmox
 * API's port is the one tried for a Proxmox profile and ssh for an ssh one.
 */
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { rmSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const OUT = join(tmpdir(), 'reach-' + process.pid + '.mjs').replace(/\\/g, '/');

await build({
  stdin: {
    contents: `export * from '${ROOT}/src/survey/reach';
               export { dict } from '${ROOT}/src/i18n/index';`,
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true, format: 'esm', outfile: OUT, platform: 'neutral',
  alias: { '@': `${ROOT}/src` }, logLevel: 'error',
  define: { __APP_VERSION__: '"0.0.0"' },
});
const {
  healthOf, healthTone, reachKey, socketsOf, primarySocket, accepted, downAmong, dict,
} = await import(`file://${OUT}`);

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '   ' + detail : ''}`);
  if (!ok) failures += 1;
};

const profile = (over = {}) => ({
  id: 'p1', kind: 'proxmox', label: 'Proxmox', baseUrl: 'https://192.168.2.10:8006',
  username: 'root@pam!x', site: '', fingerprint: 'cert',
  sshEnabled: false, sshHost: '', sshPort: 0, sshUsername: '', sshAuthMethod: '',
  sshFingerprint: null, flavour: '', createdAt: '', lastRun: null, ...over,
});

const up = (ms = 4) => ({ reach: { up: true, ms, message: '' }, at: '2026-10-31T10:00:00Z' });
const down = (message = 'refused') => ({ reach: { up: false, ms: 2500, message }, at: '2026-10-31T10:00:00Z' });

/* ----------------------------------------------- green is never a guess */

const pve = profile();
check('a profile nobody has checked is not green',
  healthTone(healthOf(pve, {})) !== 'ok', healthOf(pve, {}));
check('and says so rather than nothing', healthOf(pve, {}) === 'unchecked');
check('a check under way is not green yet',
  healthTone(healthOf(pve, { [reachKey('p1', false)]: 'checking' })) !== 'ok');
check('a machine that did not answer is red',
  healthTone(healthOf(pve, { [reachKey('p1', false)]: down() })) === 'bad');
check('a machine that answered is green',
  healthTone(healthOf(pve, { [reachKey('p1', false)]: up() })) === 'ok');

// The case this was written for: everything accepted, nothing switched on.
check('an accepted certificate on its own never turns the light green',
  healthTone(healthOf(profile({ fingerprint: 'cert' }), {})) !== 'ok');
check('nor does one on a machine measured as down',
  healthTone(healthOf(profile({ fingerprint: 'cert' }), { [reachKey('p1', false)]: down() })) === 'bad');

// Exhaustive over the shapes a stored profile can have: no filled-in field
// combination may reach green without a successful connect in the map.
const flags = [0, 1, 2, 3, 4, 5, 6, 7];
const shapes = [];
for (const kind of ['proxmox', 'unifi', 'ssh']) {
  for (const bits of flags) {
    shapes.push(profile({
      kind,
      fingerprint: bits & 1 ? 'cert' : null,
      sshEnabled: Boolean(bits & 2),
      sshHost: bits & 2 ? '192.168.1.2' : '',
      sshPort: bits & 2 ? 22 : 0,
      sshFingerprint: bits & 4 ? 'key' : null,
    }));
  }
}
const greenWithoutMeasurement = shapes.filter((p) => healthTone(healthOf(p, {})) === 'ok');
check(`no shape of profile is green unchecked (${shapes.length} shapes)`,
  greenWithoutMeasurement.length === 0,
  greenWithoutMeasurement.map((p) => p.kind).join(','));

const greenWhileDown = shapes.filter((p) => {
  const socket = primarySocket(p);
  if (!socket) return false;
  return healthTone(healthOf(p, { [reachKey(p.id, socket.ssh)]: down() })) === 'ok';
});
check('and none is green while its own socket is down', greenWhileDown.length === 0,
  greenWhileDown.map((p) => p.kind).join(','));

/* ------------------------------------------- accepting stays its own fact */

check('an unaccepted certificate is a warning even on a machine that answers',
  healthOf(profile({ fingerprint: null }), { [reachKey('p1', false)]: up() }) === 'notAccepted');
check('a profile with no address at all says that',
  healthOf(profile({ baseUrl: '' }), {}) === 'incomplete');
check('accepting is read from the half the profile is surveyed through',
  accepted(profile({ kind: 'ssh', fingerprint: 'cert', sshFingerprint: null })) === false &&
  accepted(profile({ kind: 'ssh', sshEnabled: true, sshHost: 'h', sshFingerprint: 'key' })) === true);

/* -------------------------------------------------- the right socket */

check('a Proxmox profile is tried on the port its URL names',
  JSON.stringify(primarySocket(pve)) === JSON.stringify({ host: '192.168.2.10', port: 8006, ssh: false }),
  JSON.stringify(primarySocket(pve)));
check('a controller with no port in its URL is tried on 443',
  primarySocket(profile({ kind: 'unifi', baseUrl: 'https://192.168.1.2' }))?.port === 443);
check('an ssh-only profile is tried over ssh',
  JSON.stringify(primarySocket(profile({
    kind: 'ssh', baseUrl: '', sshEnabled: true, sshHost: '10.0.0.5', sshPort: 0, sshFingerprint: 'key',
  }))) === JSON.stringify({ host: '10.0.0.5', port: 22, ssh: true }));
check('both halves of a profile that has two are offered for checking',
  socketsOf(profile({ sshEnabled: true, sshHost: '192.168.2.10', sshPort: 22 })).length === 2);
check('a malformed address is not turned into a socket',
  primarySocket(profile({ baseUrl: 'not a url' })) === null);

/* ---------------------------------------------- what the run is told */

const estate = [profile(), profile({ id: 'p2', kind: 'unifi', baseUrl: 'https://192.168.1.2', fingerprint: 'cert' })];
const map = { [reachKey('p1', false)]: down(), [reachKey('p2', false)]: up() };
check('the run is told exactly which chosen systems did not answer',
  downAmong(estate, ['p1', 'p2'], map).map((p) => p.id).join(',') === 'p1');
check('and nothing is reported about systems nobody chose',
  downAmong(estate, ['p2'], map).length === 0);

/* ------------------------------------------- the wording exists in both */

for (const lang of ['hu', 'en']) {
  const t = dict(lang);
  const keys = ['reachCheck', 'reachCheckAll', 'reachNote', 'reachDown', 'reachUnchecked', 'reachIncomplete', 'reachApi', 'reachSsh'];
  const missing = keys.filter((k) => !t.survey[k]);
  check(`${lang}: the reachability wording is there`, missing.length === 0, missing.join(','));
  check(`${lang}: it can say how fast and when`,
    Boolean(t.survey.reachUp(7)) && Boolean(t.survey.reachAt('10:00:00')));
  check(`${lang}: and name what was skipped`,
    t.survey.allDown('A').includes('A') && t.survey.someDown('A').includes('A'));
}

rmSync(OUT, { force: true });
console.log(failures === 0 ? '\nOK' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
