/*
 * Which machine a plan's commands are sent to.
 *
 * The runner used to have one SSH profile selected for everything, and with a
 * UniFi gateway and a Proxmox host both reachable over SSH the gateway was as
 * likely as not to be it — so a `pct create` was one approval away from going
 * to the wrong machine. The route is now decided by what each action is for.
 *
 * Measured here: that no command the plans write is meant for the gateway at
 * all, and that for every command in every plan the only machines offered are
 * of the kind it was written for, with an accepted host key.
 */
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { rmSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const OUT = join(tmpdir(), 'ssh-routes-' + process.pid + '.mjs').replace(/\\/g, '/');

await build({
  stdin: {
    contents: `export { presets } from '${ROOT}/src/blueprint/registry';
               export { resolveBlueprint, withDefaults, createBlueprint } from '${ROOT}/src/blueprint/resolve';
               export { buildPlan } from '${ROOT}/src/blueprint/plan';
               export { flavourFor, routesFor } from '${ROOT}/src/blueprint/routes';
               export { dict } from '${ROOT}/src/i18n/index';`,
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true, format: 'esm', outfile: OUT, platform: 'neutral',
  alias: { '@': `${ROOT}/src` }, logLevel: 'error',
  define: { __APP_VERSION__: '"0.0.0"' },
});
const { presets, resolveBlueprint, withDefaults, createBlueprint, buildPlan, flavourFor, routesFor, dict } =
  await import(`file://${OUT}`);

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '   ' + detail : ''}`);
  if (!ok) failures += 1;
};

const t = dict('en');

// The machines an estate like the one this was found on has: a gateway and a
// Proxmox host, both with SSH — plus the cases that must never be offered.
const profile = (id, kind, over = {}) => ({
  id, kind, label: id, baseUrl: '', username: '', site: '', fingerprint: 'cert',
  sshEnabled: true, sshHost: id, sshPort: 22, sshUsername: 'root', sshAuthMethod: 'password',
  sshFingerprint: 'key', flavour: '', createdAt: '', lastRun: null, ...over,
});
const PROFILES = [
  profile('gateway', 'unifi'),
  profile('pve', 'proxmox'),
  profile('pve-unpinned', 'proxmox', { sshFingerprint: null }),
  profile('pve-no-ssh', 'proxmox', { sshEnabled: false }),
  profile('plain-box', 'ssh', { flavour: 'proxmox' }),
  profile('k3s', 'ssh', { flavour: 'other' }),
];

const commands = presets('en').flatMap((preset) => {
  const blueprint = createBlueprint(preset);
  blueprint.enabledModules = preset.modules.map((m) => m.id);
  blueprint.params = withDefaults(preset, blueprint.params);
  const plan = buildPlan(resolveBlueprint(blueprint, preset, t), t);
  return plan.steps.flatMap((step) =>
    step.actions
      .filter((a) => a.kind === 'command')
      .map((a) => ({ preset: preset.id, step: step.id, target: a.target })),
  );
});
console.log(`   commands across every preset: ${commands.length}`);

const forGateway = commands.filter((c) => flavourFor(c.target) === 'unifi');
check('no command the plans write is meant for the gateway', forGateway.length === 0,
  forGateway.slice(0, 5).map((c) => `${c.preset}:${c.step}`).join(', '));

const offeredGateway = commands.filter((c) => routesFor(PROFILES, c.target).some((p) => p.id === 'gateway'));
check('so the gateway is never offered for one', offeredGateway.length === 0,
  offeredGateway.slice(0, 5).map((c) => `${c.preset}:${c.step}`).join(', '));

const wrongKind = commands.filter((c) =>
  routesFor(PROFILES, c.target).some((p) => (p.kind === 'ssh' ? p.flavour : p.kind) !== flavourFor(c.target)),
);
check('every machine offered is of the kind the command was written for', wrongKind.length === 0,
  wrongKind.slice(0, 5).map((c) => `${c.preset}:${c.step}`).join(', '));

const proxmox = routesFor(PROFILES, 'proxmox').map((p) => p.id);
check('a Proxmox command is offered the Proxmox machines with an accepted key, and only those',
  proxmox.join(',') === 'pve,plain-box', proxmox.join(','));
check('Docker’s commands go to the Proxmox host that runs its machines',
  routesFor(PROFILES, 'docker').map((p) => p.id).join(',') === 'pve,plain-box');
check('a cluster command goes to the cluster machine',
  routesFor(PROFILES, 'kubernetes').map((p) => p.id).join(',') === 'k3s');

rmSync(OUT, { force: true });
console.log(failures === 0 ? '\nOK' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
