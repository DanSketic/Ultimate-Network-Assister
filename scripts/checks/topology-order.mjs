import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/*
 * How tangled is the surveyed topology?
 *
 * The complaint is readability, so the measurement is readability: how many
 * pairs of edges cross each other, and how many edges run through a device
 * card. Both are counted on the same geometry the canvas draws, so the number
 * here is the number on screen.
 *
 * The estate below is shaped like the user's: one gateway, several switches,
 * access points hanging off different switches — and deliberately listed in an
 * order that puts children nowhere near their parents.
 */
const root = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const dir = mkdtempSync(join(tmpdir(), 'layout-'));
const entry = join(dir, 'entry.ts');
writeFileSync(
  entry,
  `export { estateFromSnapshot } from '${root}/src/survey/mapping';
   export { buildFlows } from '${root}/src/lib/flows';
   export { NODE_W, NODE_H } from '${root}/src/lib/geometry';
   export { hu } from '${root}/src/i18n/hu';
   export { PALETTES } from '${root}/src/lib/palette';`,
);

const out = join(dir, 'bundle.mjs');
await build({ entryPoints: [entry], bundle: true, outfile: out, format: 'esm', platform: 'node' });
const m = await import('file://' + out.replace(/\\/g, '/'));

const dev = (mac, name, kind, uplinkMac = '', model = 'X') => ({
  mac, name, model, kind, state: 1, ip: `10.0.1.${mac.length}`, version: '6.6',
  uptimeSecs: 8000, clients: 3, uplinkMac, ports: [], radios: [], radios: [],
});

// Access points are listed in an order unrelated to the switch each hangs off.
const devices = [
  dev('gw', 'Cloud Gateway', 'udm'),
  dev('sw1', 'USW Flex 1', 'usw', 'gw'),
  dev('sw2', 'USW Flex 2', 'usw', 'gw'),
  dev('sw3', 'USW Flex 3', 'usw', 'gw'),
  dev('ap1', 'AC HD', 'uap', 'sw3'),
  dev('ap2', 'AC Mesh', 'uap', 'sw1'),
  dev('ap3', 'Nano HD', 'uap', 'sw2'),
  dev('ap4', 'U6 Pro', 'uap', 'sw3'),
  dev('ap5', 'U6 Lite', 'uap', 'sw1'),
];

const snapshot = {
  id: 's1', startedAt: '', finishedAt: '2026-08-13T10:00:00Z', log: [], errors: [],
  proxmox: null,
  unifi: {
    site: 'default', devices, networks: [], wlans: [], firewallRules: [],
    clients: devices.filter((d) => d.kind === 'uap').map((d, i) => ({
      mac: `c${i}`, hostname: `client${i}`, ip: '10.0.1.50', network: 'LAN',
      vlan: null, wired: false, apMac: d.mac, oui: 'Apple',
    })),
    portProfiles: [],
  },
};

const estate = m.estateFromSnapshot(snapshot, [], m.hu);
const { flows } = m.buildFlows({
  nodes: estate.nodes, links: estate.links, palette: m.PALETTES.light, accent: '#0b74d8',
  focus: null, showLogical: true, showEstimated: true, animate: false,
});

/* --------------------------------------------------- measuring the tangle */

/** Samples a cubic path string into a polyline. */
function polyline(d, steps = 24) {
  const n = d.match(/-?\d+(\.\d+)?/g).map(Number);
  const q = [
    { x: n[0], y: n[1] }, { x: n[2], y: n[3] },
    { x: n[4], y: n[5] }, { x: n[6], y: n[7] },
  ];
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps, u = 1 - t;
    return {
      x: u ** 3 * q[0].x + 3 * u * u * t * q[1].x + 3 * u * t * t * q[2].x + t ** 3 * q[3].x,
      y: u ** 3 * q[0].y + 3 * u * u * t * q[1].y + 3 * u * t * t * q[2].y + t ** 3 * q[3].y,
    };
  });
}

const side = (a, b, p) => Math.sign((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x));
const crosses = (a, b, c, d) => side(a, b, c) !== side(a, b, d) && side(c, d, a) !== side(c, d, b);

function tangle(flows, nodes) {
  const lines = flows.map((f) => polyline(f.d));
  let crossings = 0;
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      let hit = false;
      for (let a = 1; a < lines[i].length - 2 && !hit; a++) {
        for (let b = 1; b < lines[j].length - 2 && !hit; b++) {
          if (crosses(lines[i][a], lines[i][a + 1], lines[j][b], lines[j][b + 1])) hit = true;
        }
      }
      if (hit) crossings++;
    }
  }

  let throughCards = 0;
  for (const line of lines) {
    const hit = line.slice(2, -2).some((p) =>
      nodes.some(
        (nd) =>
          p.x > nd.x + 4 && p.x < nd.x + m.NODE_W - 4 &&
          p.y > nd.y + 4 && p.y < nd.y + m.NODE_H - 4,
      ),
    );
    if (hit) throughCards++;
  }
  return { crossings, throughCards };
}

const now = tangle(flows, estate.nodes);

// Baseline: the collection order, which is what the layout used to place.
const order = ['gw', 'sw1', 'sw2', 'sw3', 'ap1', 'ap2', 'ap3', 'ap4', 'ap5', 'clients'];
const byId = new Map(estate.nodes.map((n) => [n.id, n]));
const rows = [[], [], [], []];
for (const id of order) {
  const node = byId.get(id.startsWith('unifi:') ? id : `unifi:${id}`) ?? byId.get(id);
  if (!node) continue;
  rows[node.id === 'clients' ? 3 : id === 'gw' ? 0 : id.startsWith('sw') ? 1 : 2].push(node);
}
const unordered = rows.flatMap((row, tier) => {
  const width = row.length * m.NODE_W + (row.length - 1) * 74;
  const startX = Math.round((1499 - width) / 2);
  return row.map((node, j) => ({ ...node, x: startX + j * (m.NODE_W + 74), y: 24 + tier * 168 }));
});
const before = tangle(
  m.buildFlows({
    nodes: unordered, links: estate.links, palette: m.PALETTES.light, accent: '#0b74d8',
    focus: null, showLogical: true, showEstimated: true, animate: false,
  }).flows,
  unordered,
);

console.log(`edges                 ${flows.length}`);
console.log(`crossings   collection order ${before.crossings}   →  ordered ${now.crossings}`);
console.log(`through cards               ${before.throughCards}   →          ${now.throughCards}`);

const order2 = estate.nodes
  .filter((n) => n.id.startsWith('unifi:ap') || n.id.startsWith('unifi:sw'))
  .sort((a, b) => a.y - b.y || a.x - b.x)
  .map((n) => n.name);
console.log(`\nrow order after sorting:\n  ${order2.join('  ')}`);

let fail = 0;
if (now.crossings > before.crossings) { console.log('\nFAIL crossings did not improve'); fail = 1; }
if (now.throughCards > before.throughCards) { console.log('FAIL more edges run through cards'); fail = 1; }
console.log(fail ? '\nFAILED' : '\nOK');
process.exit(fail);
