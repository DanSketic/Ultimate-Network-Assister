import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
/*
 * Switching the interface language has to move the form fields with it —
 * but only the ones nobody filled in.
 *
 * Presets are written per language rather than translated, so a text field
 * left at its default holds whatever the language it was created in called it.
 * The rule tested here: a value matching a default in ANY language was never
 * typed by anyone and follows the interface; anything else is the user's.
 */
import { build } from 'esbuild';
import { rmSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const OUT = join(tmpdir(), 'param-bundle-' + process.pid + '.mjs').replace(/\\/g, '/');

await build({
  entryPoints: [`${ROOT}/src/blueprint/registry.ts`],
  bundle: true, format: 'esm', outfile: OUT, platform: 'neutral',
  alias: { '@': `${ROOT}/src` }, logLevel: 'error',
});
const { presets } = await import(`file://${OUT}`);

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '   ' + detail : ''}`);
  if (!ok) failures += 1;
};

const hu = presets('hu');
const en = presets('en');

check('the same presets exist in both languages', hu.length === en.length, `${hu.length} / ${en.length}`);
check(
  'and carry the same ids',
  hu.every((p, i) => p.id === en[i].id),
  hu.map((p) => p.id).join(', '),
);

/* ------------------------------- every parameter exists in both languages */

let missing = [];
let sameText = [];
for (const [i, preset] of hu.entries()) {
  const other = en[i];
  for (const param of preset.params) {
    const twin = other.params.find((p) => p.id === param.id);
    if (!twin) { missing.push(`${preset.id}:${param.id}`); continue; }
    if (typeof param.default === 'string' && param.default.length > 3 &&
        param.default === twin.default && !/^[\d.:/ -]+$/.test(param.default)) {
      sameText.push(`${preset.id}:${param.id} = ${JSON.stringify(param.default)}`);
    }
  }
}
check('no parameter is missing from the English presets', missing.length === 0, missing.join(', '));
console.log(`   text defaults identical in both languages: ${sameText.length}`);
for (const s of sameText.slice(0, 8)) console.log(`     ${s}`);

/* ---------------------- enum choices must key on a stable value, not a label */

let unstable = [];
for (const [i, preset] of hu.entries()) {
  for (const param of preset.params.filter((p) => p.options)) {
    const twin = en[i].params.find((p) => p.id === param.id);
    const huValues = param.options.map((o) => o.value).join('|');
    const enValues = (twin?.options ?? []).map((o) => o.value).join('|');
    if (huValues !== enValues) unstable.push(`${preset.id}:${param.id}  ${huValues}  vs  ${enValues}`);
  }
}
check('enum choices key on the same values in both languages', unstable.length === 0,
  unstable.slice(0, 4).join(' ; '));

/* ------------------------------------------ the swap rule, on real defaults */

// Mirrors the rule in useBlueprints: a default in any language is not a value
// anybody typed.
const spellings = new Map();
for (const list of [hu, en])
  for (const preset of list)
    for (const param of preset.params) {
      const key = `${preset.id}:${param.id}`;
      spellings.set(key, (spellings.get(key) ?? new Set()).add(param.default));
    }

const swap = (presetId, target, held) => {
  const preset = target.find((p) => p.id === presetId);
  const out = {};
  for (const param of preset.params) {
    const value = held[param.id];
    out[param.id] =
      value !== undefined && spellings.get(`${presetId}:${param.id}`)?.has(value)
        ? param.default
        : value;
  }
  return out;
};

const home = hu.find((p) => p.id === 'home') ?? hu[0];
const asCreatedInHungarian = Object.fromEntries(home.params.map((p) => [p.id, p.default]));
const moved = swap(home.id, en, asCreatedInHungarian);
const englishHome = en.find((p) => p.id === home.id);

check(
  'untouched fields arrive in English',
  englishHome.params.every((p) => moved[p.id] === p.default),
);

const typed = { ...asCreatedInHungarian };
const text = home.params.find((p) => p.type === 'text');
if (text) {
  typed[text.id] = 'Nagymama halozata';
  const kept = swap(home.id, en, typed);
  check('but something typed in is kept as typed', kept[text.id] === 'Nagymama halozata',
    String(kept[text.id]));
  check(
    'while its neighbours still move',
    englishHome.params.filter((p) => p.id !== text.id).every((p) => kept[p.id] === p.default),
  );
} else {
  check('a text parameter exists to test with', false);
}

// Going back has to work too, or the swap is one-way.
const back = swap(home.id, hu, moved);
check('and switching back returns the Hungarian wording',
  home.params.every((p) => back[p.id] === p.default));

rmSync(OUT, { force: true });
console.log(failures === 0 ? '\nOK' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
