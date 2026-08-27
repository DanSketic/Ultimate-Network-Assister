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
 * only claim `auto` if this application has a way to carry it out, and there
 * are exactly two — an action the apply pipeline writes, read from the apply
 * layer itself rather than restated, or a command the SSH runner can send. The
 * rest is checked from the other end too: a plan step that is only prose must
 * not claim anything at all, and neither must one whose commands are all
 * shapes with a blank left in them.
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
               export { isTemplateCommand, isDestructiveCommand } from '${ROOT}/src/blueprint/automation';
               export { dict } from '${ROOT}/src/i18n/index';`,
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true, format: 'esm', outfile: OUT, platform: 'neutral',
  alias: { '@': `${ROOT}/src` }, logLevel: 'error',
});
const { presets, resolveBlueprint, withDefaults, createBlueprint, buildPlan, compileOperations,
        isTemplateCommand, isDestructiveCommand, dict } =
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

/** A command this application could actually send: real, and safe to send. */
const runnable = (action) =>
  action.kind === 'command' &&
  !action.destructive &&
  !isTemplateCommand(action.body) &&
  !isDestructiveCommand(action.body);

const overclaimed = [];
const automatable = [];
const byRoute = { written: 0, ssh: 0 };
for (const { preset, plan } of runs) {
  for (const step of plan.steps) {
    if (step.capability !== 'auto') continue;
    automatable.push(`${preset.id}:${step.id}`);
    const written = step.actions.some((a) => a.kind === 'api' && a.writable);
    const overSsh = step.actions.some(runnable);
    if (written) byRoute.written += 1;
    else if (overSsh) byRoute.ssh += 1;
    if (!written && !overSsh) overclaimed.push(`${preset.id}:${step.id}`);
  }
}
check(
  'every automatable step has a route: the applier writes it, or a command runs it',
  overclaimed.length === 0,
  overclaimed.join(', '),
);
console.log(`   steps claiming auto: ${automatable.length}  (written ${byRoute.written}, over ssh ${byRoute.ssh})`);
for (const s of automatable) console.log(`     ${s}`);

/* --------------------------------- and a destructive step never claims either one */

const destructiveClaims = runs.flatMap(({ preset, plan }) =>
  plan.steps
    .filter(
      (s) =>
        s.capability !== 'manual' &&
        s.actions.some((a) => a.destructive || isDestructiveCommand(a.body)),
    )
    .map((s) => `${preset.id}:${s.id}`),
);
check(
  'a step that can destroy storage is manual, whatever it asked for',
  destructiveClaims.length === 0,
  destructiveClaims.join(', '),
);

/* ------------------------- a command that is a shape to fill in is not a claim */

const templateClaims = runs.flatMap(({ preset, plan }) =>
  plan.steps
    .filter(
      (s) =>
        s.capability === 'auto' &&
        !s.actions.some((a) => a.kind === 'api' && a.writable) &&
        s.actions.filter((a) => a.kind === 'command').every((a) => isTemplateCommand(a.body)),
    )
    .map((s) => `${preset.id}:${s.id}`),
);
check(
  'a step whose commands are all placeholders claims nothing',
  templateClaims.length === 0,
  templateClaims.join(', '),
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
