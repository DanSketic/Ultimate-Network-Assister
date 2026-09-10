/*
 * The order a plan insists on.
 *
 * A plan has always been a sequence and, until the application could run one,
 * nothing had to hold it: a person reading step 31 has read step 30. Running a
 * step on its own is different — `pct create` against a pool that does not
 * exist yet fails, and against a pool that exists under another name it
 * succeeds at making the wrong thing.
 *
 * So the steps now name what has to come first, and three things have to be
 * true of those names or they are worse than nothing: every one must point at
 * a step that exists, none may point backwards into a cycle, and none may
 * point at a step that comes later in the plan than the one waiting for it.
 * The last is the one that catches a real mistake — a prerequisite the reader
 * would only reach after the step that needs it.
 */
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { rmSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const OUT = join(tmpdir(), 'plan-order-' + process.pid + '.mjs').replace(/\\/g, '/');

await build({
  stdin: {
    contents: `export { presets } from '${ROOT}/src/blueprint/registry';
               export { resolveBlueprint, withDefaults, createBlueprint } from '${ROOT}/src/blueprint/resolve';
               export { buildPlan } from '${ROOT}/src/blueprint/plan';
               export { dict } from '${ROOT}/src/i18n/index';`,
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true, format: 'esm', outfile: OUT, platform: 'neutral',
  alias: { '@': `${ROOT}/src` }, logLevel: 'error',
  define: { __APP_VERSION__: '"0.0.0"' },
});
const { presets, resolveBlueprint, withDefaults, createBlueprint, buildPlan, dict } =
  await import(`file://${OUT}`);

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '   ' + detail : ''}`);
  if (!ok) failures += 1;
};

const t = dict('en');
const runs = presets('en').map((preset) => {
  const blueprint = createBlueprint(preset);
  blueprint.enabledModules = preset.modules.map((m) => m.id);
  blueprint.params = withDefaults(preset, blueprint.params);
  const resolved = resolveBlueprint(blueprint, preset, t);
  return { preset, plan: buildPlan(resolved, t) };
});

/*
 * And each preset as it is created, with its own modules switched off.
 *
 * Everything on is the largest plan, and the one that hid a real miss: the
 * flat Proxmox preset starts with its trunk-bridge module off, and every
 * machine in it waited for the trunk bridge — a step that was not in the plan
 * and could never be ticked. Measuring only the plan with everything on never
 * saw it.
 */
for (const preset of presets('en')) {
  const blueprint = createBlueprint(preset);
  runs.push({ preset: { ...preset, id: `${preset.id} (defaults)` }, plan: buildPlan(resolveBlueprint(blueprint, preset, t), t) });
}

/* ------------------------------------------- every prerequisite is a real step */

const dangling = [];
for (const { preset, plan } of runs) {
  const ids = new Set(plan.steps.map((s) => s.id));
  for (const step of plan.steps) {
    for (const id of step.requires) {
      if (!ids.has(id)) dangling.push(`${preset.id}: ${step.id} → ${id}`);
    }
  }
}
check('every prerequisite names a step that exists', dangling.length === 0, dangling.join(', '));

/* ------------------------------------------------ and one that comes before it */

const backwards = [];
for (const { preset, plan } of runs) {
  const at = new Map(plan.steps.map((s, i) => [s.id, i]));
  for (const [i, step] of plan.steps.entries()) {
    for (const id of step.requires) {
      const where = at.get(id);
      if (where !== undefined && where > i) {
        backwards.push(`${preset.id}: ${step.id} waits for ${id}, which is later`);
      }
    }
  }
}
check('a prerequisite comes earlier in the plan than the step waiting for it', backwards.length === 0, backwards.join(', '));

/* ------------------------------------------------------------ and never a loop */

const cycles = [];
for (const { preset, plan } of runs) {
  const requires = new Map(plan.steps.map((s) => [s.id, s.requires]));
  const state = new Map();
  const walk = (id, trail) => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'open') {
      cycles.push(`${preset.id}: ${[...trail, id].join(' → ')}`);
      return;
    }
    state.set(id, 'open');
    for (const next of requires.get(id) ?? []) walk(next, [...trail, id]);
    state.set(id, 'done');
  };
  for (const id of requires.keys()) walk(id, []);
}
check('no step waits, however indirectly, for itself', cycles.length === 0, cycles.slice(0, 3).join(' | '));

/* ------------------------- a step that builds a machine says what it rests on */

const guestSteps = runs.flatMap(({ preset, plan }) =>
  plan.steps
    .filter((s) => /guest-\d+$/.test(s.id))
    .map((s) => ({ preset: preset.id, step: s })),
);
const unanchored = guestSteps
  .filter(({ step }) => step.requires.length === 0)
  .map(({ preset, step }) => `${preset}:${step.id}`);
console.log(`   steps that build a machine: ${guestSteps.length}`);
check(
  'a machine is never built out of nothing: its step names the pool and the bridge',
  unanchored.length === 0,
  unanchored.join(', '),
);

/* ------------------- and software is never installed into a machine that is not there */

const installSteps = runs.flatMap(({ preset, plan }) =>
  plan.steps.filter((s) => /install-\d+$/.test(s.id)).map((s) => ({ preset: preset.id, step: s })),
);
/*
 * Directly, or through the step that installs the operating system.
 *
 * A Linux guest now has three: build the machine, install the system, install
 * the software. The last waits on the middle one, which waits on the first, so
 * the chain is what has to reach the machine — not a single hop.
 */
const requiresChain = (plan, from, wanted) => {
  const byId = new Map(plan.steps.map((s) => [s.id, s]));
  const seen = new Set();
  const walk = (id) => {
    if (id === wanted) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return (byId.get(id)?.requires ?? []).some(walk);
  };
  return (byId.get(from)?.requires ?? []).some(walk);
};

const orphaned = installSteps
  .filter(({ step }) => {
    const vmid = step.id.split('-').pop();
    const plan = runs.find((r) => r.plan.steps.includes(step)).plan;
    const machine = plan.steps.find((s) => s.id.endsWith(`guest-${vmid}`));
    return !machine || !requiresChain(plan, step.id, machine.id);
  })
  .map(({ preset, step }) => `${preset}:${step.id}`);
console.log(`   steps that install software inside a machine: ${installSteps.length}`);
check(
  'installing into a machine waits for that machine to be built',
  orphaned.length === 0,
  orphaned.join(', '),
);

/* ------------------- and asks whether it answers before it does anything to it */

const unchecked = installSteps
  .filter(({ step }) => !/pct status|guest exec .* -- true/.test(step.actions[0]?.body ?? ''))
  .map(({ preset, step }) => `${preset}:${step.id}`);
check(
  'and asks whether the machine answers before installing anything',
  unchecked.length === 0,
  unchecked.join(', '),
);

rmSync(OUT, { force: true });
console.log(failures === 0 ? '\nOK' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
