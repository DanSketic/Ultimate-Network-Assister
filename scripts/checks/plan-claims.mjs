/*
 * What the plan says it can do for you.
 *
 * "Automatable" is a claim about this application, not about the vendor: an
 * API existing somewhere is not the same as this program being able to call
 * it. The plan used to count a step as automatable whenever it described an
 * API call, which put nine of them on the counter while the applier could
 * write two kinds of object and nothing else.
 *
 * So the rule measured here is the one the counter now rests on: a step may
 * only claim `auto` if it carries an action the apply pipeline actually writes,
 * and what the pipeline writes is read from the apply layer itself rather than
 * restated. The rest is checked from the other end too — a plan step that is
 * only prose must not claim anything at all.
 */
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { rmSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const OUT = join(tmpdir(), 'plan-claims-bundle-' + process.pid + '.mjs').replace(/\\/g, '/');

await build({
  stdin: {
    contents: `export { presets } from '${ROOT}/src/blueprint/registry';
               export { resolveBlueprint, withDefaults, createBlueprint } from '${ROOT}/src/blueprint/resolve';
               export { buildPlan } from '${ROOT}/src/blueprint/plan';
               export { compileOperations } from '${ROOT}/src/apply/compile';
               export { dict } from '${ROOT}/src/i18n/index';`,
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true, format: 'esm', outfile: OUT, platform: 'neutral',
  alias: { '@': `${ROOT}/src` }, logLevel: 'error',
});
const { presets, resolveBlueprint, withDefaults, createBlueprint, buildPlan, compileOperations, dict } =
  await import(`file://${OUT}`);

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '   ' + detail : ''}`);
  if (!ok) failures += 1;
};

const t = dict('en');

const runs = presets('en').map((preset) => {
  const blueprint = createBlueprint(preset);
  // Everything on, including the modules a preset starts switched off: the
  // claim has to hold for the largest plan the preset can produce.
  blueprint.enabledModules = preset.modules.map((m) => m.id);
  blueprint.params = withDefaults(preset, blueprint.params);
  const resolved = resolveBlueprint(blueprint, preset, t);
  return { preset, resolved, plan: buildPlan(resolved, t), operations: compileOperations(resolved) };
});

/* ------------------------------------ automatable means the applier writes it */

const overclaimed = [];
const automatable = [];
for (const { preset, plan } of runs) {
  for (const step of plan.steps) {
    if (step.capability !== 'auto') continue;
    automatable.push(`${preset.id}:${step.id}`);
    if (!step.actions.some((a) => a.kind === 'api' && a.writable)) {
      overclaimed.push(`${preset.id}:${step.id}`);
    }
  }
}
check(
  'every automatable step carries an action the applier writes',
  overclaimed.length === 0,
  overclaimed.join(', '),
);
console.log(`   steps claiming auto: ${automatable.length}`);
for (const s of automatable) console.log(`     ${s}`);

/* ------------------------------- and the applier has something for each of them */

for (const { preset, plan, operations } of runs) {
  const claims = plan.steps.filter((s) => s.capability === 'auto').length;
  if (claims === 0) continue;
  check(
    `${preset.id}: the operations exist to back the claim`,
    operations.length > 0,
    `${claims} steps, ${operations.length} operations`,
  );
}

/* --------------------------------------- a preset with nothing to write says so */

const nothingToWrite = runs.filter((r) => r.operations.length === 0);
console.log(`   presets the apply pipeline has no work for: ${nothingToWrite.length}`);
for (const r of nothingToWrite) console.log(`     ${r.preset.id}`);
check(
  'a preset with no operations claims no automatable step either',
  nothingToWrite.every((r) => r.plan.steps.every((s) => s.capability !== 'auto')),
  nothingToWrite
    .flatMap((r) => r.plan.steps.filter((s) => s.capability === 'auto').map((s) => `${r.preset.id}:${s.id}`))
    .join(', '),
);

/* ------------------------------------------ a step with no actions promises nothing */

const emptyClaims = runs.flatMap(({ preset, plan }) =>
  plan.steps
    .filter((s) => s.actions.length === 0 && s.capability !== 'manual')
    .map((s) => `${preset.id}:${s.id} → ${s.capability}`),
);
check('a step with nothing to do is manual', emptyClaims.length === 0, emptyClaims.slice(0, 5).join(', '));

rmSync(OUT, { force: true });
console.log(failures === 0 ? '\nOK' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
