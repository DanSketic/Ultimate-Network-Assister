/*
 * How far the building is cut up.
 *
 * Clients follow the layout, but IoT and guests need not. Where the floors may
 * reach each other, a sensor or guest subnet per floor separates nothing that
 * is not already open — it only multiplies VLANs, keys and rules. What is
 * measured here is that the default follows that reasoning, that asking for the
 * split anyway still gets it, and that the plan stays consistent either way:
 * no zone named that no network created, no rule between a pair that does not
 * exist, no key pointing at a VLAN nobody built.
 */
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { rmSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const OUT = join(tmpdir(), 'scope-bundle-' + process.pid + '.mjs').replace(/\\/g, '/');

await build({
  stdin: {
    contents: `export { presets } from '${ROOT}/src/blueprint/registry';
               export { resolveBlueprint, withDefaults } from '${ROOT}/src/blueprint/resolve';
               export { dict } from '${ROOT}/src/i18n/index';`,
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true, format: 'esm', outfile: OUT, platform: 'neutral',
  alias: { '@': `${ROOT}/src` }, logLevel: 'error',
});
const { presets, resolveBlueprint, withDefaults, dict } = await import(`file://${OUT}`);

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '   ' + detail : ''}`);
  if (!ok) failures += 1;
};

const t = dict('en');
const preset = presets('en').find((p) => p.id === 'multi-household-proxmox-unifi');

/** Resolves the preset with every module on and the given parameters changed. */
const resolve = (params) =>
  resolveBlueprint(
    {
      presetId: preset.id,
      enabledModules: preset.modules.map((m) => m.id),
      params: withDefaults(preset, params),
      households: preset.households.map((h) => ({ ...h })),
      ports: [],
    },
    preset,
    t,
  );

const named = (r, role) => r.networks.filter((n) => n.role === role).map((n) => n.name);
const floors = preset.households.length;

/* ------------------------------------------------ what each layout produces */

const isolated = resolve({ layout: 'floorsIsolated' });
const open = resolve({ layout: 'floorsOpen' });
const single = resolve({ layout: 'single' });

check(
  'full isolation still gets a client, IoT and guest network per floor',
  named(isolated, 'household').length === floors &&
    named(isolated, 'iot').length === floors &&
    named(isolated, 'guest').length === floors + 1, // + the shared guest VLAN
  named(isolated, 'iot').join(', '),
);
check(
  'open floors keep their own client networks',
  named(open, 'household').length === floors,
  named(open, 'household').join(', '),
);
check(
  'but share one IoT network between them',
  named(open, 'iot').length === 1,
  named(open, 'iot').join(', '),
);
check(
  'and one guest network beside the shared guest VLAN',
  named(open, 'guest').length === 2,
  named(open, 'guest').join(', '),
);
check(
  'a single household is unchanged by any of this',
  named(single, 'household').length === 1 && named(single, 'iot').length === 1,
  [...named(single, 'household'), ...named(single, 'iot')].join(', '),
);

console.log(
  `   networks: isolated ${isolated.networks.length}, open ${open.networks.length}, single ${single.networks.length}`,
);

/* --------------------------------------------------- the split on request */

const openSplit = resolve({ layout: 'floorsOpen', iotScope: 'perFloor', guestScope: 'perFloor' });
check(
  'open floors can still ask for a subnet per floor',
  named(openSplit, 'iot').length === floors && named(openSplit, 'guest').length === floors + 1,
  named(openSplit, 'iot').join(', '),
);
check(
  'and it produces the same networks full isolation would',
  named(openSplit, 'iot').join() === named(isolated, 'iot').join(),
);

const isolatedShared = resolve({ layout: 'floorsIsolated', iotScope: 'shared', guestScope: 'shared' });
check(
  'isolated floors can share them the other way round',
  named(isolatedShared, 'iot').length === 1 && named(isolatedShared, 'guest').length === 2,
  named(isolatedShared, 'iot').join(', '),
);

/* ------------------------------------------- the plan holds together either way */

const CASES = [
  ['floorsIsolated', isolated],
  ['floorsOpen', open],
  ['single', single],
  ['floorsOpen + split', openSplit],
  ['floorsIsolated + shared', isolatedShared],
];

const danglingZones = [];
const danglingRules = [];
const danglingKeys = [];
const duplicateRules = [];
for (const [label, r] of CASES) {
  const vlans = new Set(r.networks.map((n) => n.vlan));
  const zones = new Set(r.zones.map((z) => z.name));

  for (const z of r.zones) {
    for (const v of z.vlans) if (!vlans.has(v)) danglingZones.push(`${label}: ${z.name} → VLAN ${v}`);
  }
  // Only zone-to-zone endpoints can be checked; the rest name address objects
  // or prose targets, which are not zones and never were.
  for (const p of r.policies) {
    for (const end of [p.from, p.to]) {
      if (/^(HOUSE|IOT|GUEST)(-|$)/.test(end) && !zones.has(end)) {
        danglingRules.push(`${label}: ${p.from} → ${p.to}`);
      }
    }
  }
  for (const s of r.ssids) {
    for (const key of s.ppsk) {
      if (!vlans.has(key.vlan)) danglingKeys.push(`${label}: ${s.name} / ${key.label} → ${key.vlan}`);
    }
  }
  const seen = new Set();
  for (const p of r.policies) {
    const id = `${p.order} ${p.from} → ${p.to} ${p.action}`;
    if (seen.has(id)) duplicateRules.push(`${label}: ${id}`);
    seen.add(id);
  }

  const errors = r.issues.filter((i) => i.severity === 'error');
  check(`${label} resolves without contradictions`, errors.length === 0,
    errors.map((i) => i.message).join(' ; '));
}

check('every zone is made of networks that exist', danglingZones.length === 0, danglingZones.slice(0, 4).join(' ; '));
check('every rule names a zone that exists', danglingRules.length === 0, danglingRules.slice(0, 4).join(' ; '));
check('every Wi-Fi key lands in a network that exists', danglingKeys.length === 0, danglingKeys.slice(0, 4).join(' ; '));
check('and no rule is written twice', duplicateRules.length === 0, duplicateRules.slice(0, 4).join(' ; '));

rmSync(OUT, { force: true });
console.log(failures === 0 ? '\nOK' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
