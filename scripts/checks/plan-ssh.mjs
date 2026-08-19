/*
 * Which of the plan's commands the application is willing to run.
 *
 * The plan has always written exact command text; it can now send that text to
 * a machine over SSH. That makes a question worth measuring rather than
 * assuming: which commands does the interface offer a Run button for?
 *
 * Two gates decide it before the far side is even asked — a shape with a blank
 * left in it, and anything destructive — and a third afterwards: on a step
 * that needs someone at the machine, reading is still fine but changing
 * anything is not, because the change can cut the session it would travel
 * over. This walks every step of every preset and checks the gates hold,
 * including against the native policy's own lists, which are read from the
 * Rust source so the two sides cannot quietly drift apart.
 */
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const OUT = join(tmpdir(), 'plan-ssh-bundle-' + process.pid + '.mjs').replace(/\\/g, '/');

await build({
  stdin: {
    contents: `export { presets } from '${ROOT}/src/blueprint/registry';
               export { resolveBlueprint, withDefaults, createBlueprint } from '${ROOT}/src/blueprint/resolve';
               export { buildPlan } from '${ROOT}/src/blueprint/plan';
               export { isTemplateCommand, isDestructiveCommand } from '${ROOT}/src/blueprint/automation';
               export { dict } from '${ROOT}/src/i18n/index';`,
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true, format: 'esm', outfile: OUT, platform: 'neutral',
  alias: { '@': `${ROOT}/src` }, logLevel: 'error',
});
const {
  presets, resolveBlueprint, withDefaults, createBlueprint, buildPlan,
  isTemplateCommand, isDestructiveCommand, dict,
} = await import(`file://${OUT}`);

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '   ' + detail : ''}`);
  if (!ok) failures += 1;
};

const t = dict('en');

/*
 * The native policy's read-only side, approximated from the same source.
 *
 * Deliberately stricter than the real matcher, which also strips `sudo` and
 * environment assignments: a command this says is not read-only, but the
 * policy would let through, shows up as a failure here rather than as a Run
 * button nobody meant to offer.
 */
const RUST = readFileSync(`${ROOT}/src-tauri/src/sshpolicy.rs`, 'utf8');
const listBetween = (from, to) =>
  [...RUST.slice(RUST.indexOf(from), RUST.indexOf(to)).matchAll(/"([^"]+)"/g)].map((m) =>
    m[1].toLowerCase(),
  );
const READ_ONLY = listBetween('const READ_ONLY', 'const SPLITTERS');

function looksReadOnly(body) {
  // The policy takes the strictest verdict across the segments of a line.
  return body
    .split(/[;|&\n\r]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .every((segment) =>
      !segment.includes('>') &&
      READ_ONLY.some((safe) => segment === safe || segment.startsWith(`${safe} `)),
    );
}

/* ------------------------------------- every command action of every preset */

const commands = [];
for (const preset of presets('en')) {
  const blueprint = createBlueprint(preset);
  blueprint.enabledModules = preset.modules.map((m) => m.id);
  blueprint.params = withDefaults(preset, blueprint.params);
  const plan = buildPlan(resolveBlueprint(blueprint, preset, t), t);

  for (const step of plan.steps) {
    for (const action of step.actions) {
      if (action.kind !== 'command') continue;
      const template = isTemplateCommand(action.body);
      const destructive = action.destructive || isDestructiveCommand(action.body);
      const readOnly = looksReadOnly(action.body);
      commands.push({
        preset: preset.id,
        step: step.id,
        label: action.label,
        body: action.body,
        template,
        localConsole: step.requiresLocalConsole,
        destructive,
        readOnly,
        // Mirrors ActionCard, with the policy's verdict approximated below.
        offered: !template && !destructive && (!step.requiresLocalConsole || readOnly),
      });
    }
  }
}

const offered = commands.filter((c) => c.offered);
const withheld = commands.filter((c) => !c.offered);
check('the presets produce commands to measure', commands.length > 0, `${commands.length} commands`);
console.log(`   offered ${offered.length}, withheld ${withheld.length}`);
for (const c of withheld) {
  const why = c.destructive ? 'destructive' : c.template ? 'template' : 'local console';
  console.log(`     ${why.padEnd(13)} ${c.step} · ${c.label}`);
}

/* ------------------------------------------------ nothing half-written runs */

const blanks = offered.filter((c) => /<[^<>\n]+>/.test(c.body) || c.body.includes('…'));
check('no offered command still has a blank in it', blanks.length === 0,
  blanks.map((c) => c.body.split('\n')[0]).slice(0, 3).join(' ; '));

const empty = offered.filter((c) => c.body.trim() === '');
check('and none of them is empty', empty.length === 0);

/* ------------------------- on a console step, reading yes, changing no */

const consoleSteps = commands.filter((c) => c.localConsole);
check(
  'a step needing a local console offers only its reading commands',
  consoleSteps.every((c) => !c.offered || c.readOnly),
  consoleSteps.filter((c) => c.offered && !c.readOnly).map((c) => c.label).join(', '),
);
check(
  'and it does offer those',
  consoleSteps.some((c) => c.offered),
  consoleSteps.filter((c) => c.offered).map((c) => c.label).join(', '),
);

/* ------------------------ agreement with the policy on the far side of the IPC */

// The Rust list is the one that actually decides. Reading it here means a new
// entry there cannot leave a Run button standing on this side.
const forbidden = listBetween('const FORBIDDEN', 'const READ_ONLY');
check('the native forbidden list was found', forbidden.length > 10, `${forbidden.length} entries`);

const wouldBeRefused = offered.filter((c) =>
  forbidden.some((f) => c.body.toLowerCase().includes(f)),
);
check(
  'no offered command is one the native policy forbids',
  wouldBeRefused.length === 0,
  wouldBeRefused.map((c) => `${c.step}: ${c.body.split('\n')[0]}`).slice(0, 3).join(' ; '),
);

/* -------------------------------------------- the known dangerous ones, named */

const bodyOf = (needle) => commands.find((c) => c.body.includes(needle));
for (const [needle, why] of [
  ['zpool create', 'pool creation'],
  ['mkfs.xfs', 'making a filesystem'],
  ['bridge-vlan-aware', 'the interfaces stanza'],
  ['K3S_TOKEN=<token>', 'the join command with a blank token'],
]) {
  const found = bodyOf(needle);
  check(`${why} is not offered`, found !== undefined && !found.offered,
    found === undefined ? 'not present in any plan' : '');
}

rmSync(OUT, { force: true });
console.log(failures === 0 ? '\nOK' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
