import { fileURLToPath } from 'node:url';
/* What one hover costs: buildFlows runs again every time the focus changes. */
import { build } from 'esbuild';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const dir = mkdtempSync(join(tmpdir(), 'perf-'));
const entry = join(dir, 'entry.ts');
writeFileSync(entry,
  `export { estateFromSnapshot } from '${root}/src/survey/mapping';
   export { buildFlows } from '${root}/src/lib/flows';
   export { hu } from '${root}/src/i18n/hu';
   export { PALETTES } from '${root}/src/lib/palette';`);
const out = join(dir, 'bundle.mjs');
await build({ entryPoints: [entry], bundle: true, outfile: out, format: 'esm', platform: 'node' });
const m = await import('file://' + out.replace(/\\/g, '/'));
const { snapshot } = await import('./fixtures/estate.mjs');

const estate = m.estateFromSnapshot(snapshot, [], m.hu);
const run = (focus) =>
  m.buildFlows({ nodes: estate.nodes, links: estate.links, palette: m.PALETTES.light,
    accent: '#0b74d8', focus, showLogical: true, showEstimated: true, animate: false });

run(null); // warm up

const ids = estate.nodes.map((n) => n.id);
const times = [];
for (let i = 0; i < 40; i++) {
  const t = process.hrtime.bigint();
  run(ids[i % ids.length]);
  times.push(Number(process.hrtime.bigint() - t) / 1e6);
}
times.sort((a, b) => a - b);
const at = (q) => times[Math.min(times.length - 1, Math.floor(times.length * q))].toFixed(2);
console.log(`nodes ${estate.nodes.length}   links ${estate.links.length}`);
console.log(`buildFlows per hover:  median ${at(0.5)} ms   p90 ${at(0.9)} ms   worst ${at(1)} ms`);
console.log(Number(at(0.9)) < 16 ? '\nOK  (inside one frame)' : '\nSLOW  (over a frame budget)');
process.exit(Number(at(0.9)) < 16 ? 0 : 1);
