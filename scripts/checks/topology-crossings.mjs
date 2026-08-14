import { fileURLToPath } from 'node:url';
/*
 * The user's own estate, as far as the screenshot shows it.
 *
 * What makes it harder than the earlier fixture is the cables that skip a
 * tier: the gateway wired straight to an access point, and a Proxmox host two
 * rows above its own stores. Those are the ones that used to cross everything,
 * because nothing in the ordering knew they existed.
 *
 * Measured on the geometry the canvas actually draws, so the count here is the
 * count on screen.
 */
import { build } from 'esbuild';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const dir = mkdtempSync(join(tmpdir(), 'cross-'));
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

const port = (idx, neighbourMac, neighbourName, speed = 1000) => ({
  idx, name: '', up: true, enabled: true, speed, fullDuplex: true, poeEnabled: false,
  poePower: '', portConfId: '', taggedVlanMgmt: '', neighbourMac, neighbourName,
  neighbourPort: '', isUplink: false,
});

const dev = (mac, name, kind, uplinkMac, model, ports = []) => ({
  mac, name, model, kind, state: 1, ip: `192.168.11.${mac.length + 60}`, version: '6.6',
  uptimeSecs: 90000, clients: 5, uplinkMac, uplinkRemotePort: 0, uplinkLocalPort: 0, ports,
});

// Listed the way a controller returns them: gateway, switches, then every
// access point — nowhere near the switch each one hangs off.
const devices = [
  dev('gw', 'Cloud Gateway', 'udm', '', 'UDMA6AB', [
    port(5, 'mini', 'USW Flex Mini'), port(3, 'sw1', 'USW Flex 2.5G'),
    port(4, 'nano', 'Nano HD'),
  ]),
  dev('mini', 'USW Flex Mini', 'usw', 'gw', 'USMINI', [port(5, 'gw', 'Cloud Gateway')]),
  dev('sw1', 'USW Flex 2.5G A', 'usw', 'gw', 'USWED', [
    port(2, 'gw', 'Cloud Gateway'), port(1, 'sw2', 'USW Flex 2.5G B'),
    port(7, 'achd', 'AC HD'), port(3, 'mesh', 'AC Mesh'),
  ]),
  dev('sw2', 'USW Flex 2.5G B', 'usw', 'sw1', 'USWE', [port(4, 'sw1', 'USW Flex 2.5G A')]),
  // Uplinked straight to the gateway: the cable that skips the switch row.
  dev('nano', 'Nano HD', 'uap', 'gw', 'U7NHD'),
  dev('achd', 'AC HD', 'uap', 'sw1', 'U7HD'),
  dev('mesh', 'AC Mesh', 'uap', 'sw1', 'U7MSH'),
];

const snapshot = {
  id: 's', startedAt: '', finishedAt: '2026-08-13T10:00:00Z', log: [], errors: [],
  proxmox: {
    version: '9.2',
    nodes: [{ name: 'pve', status: 'online', cpuRatio: 0.2, cpuCount: 8,
      memUsed: 8e9, memTotal: 32e9, uptimeSecs: 90000 }],
    // Two stores, two rows below their host.
    storages: [
      { node: 'pve', name: 'local-lvm', kind: 'lvmthin', total: 4e11, used: 1e11,
        available: 3e11, enabled: true, content: 'images,rootdir', active: true },
      { node: 'pve', name: 'local', kind: 'dir', total: 1e11, used: 2e10,
        available: 8e10, enabled: true, content: 'backup,iso', active: true },
    ],
    guests: [{ vmid: 100, name: 'CT100', kind: 'lxc', node: 'pve', status: 'stopped',
      cpuCount: 2, memTotal: 2e9, diskTotal: 8e9, tags: '' }],
    interfaces: [], disks: [], backupJobs: [], backupFiles: [],
  },
  unifi: {
    site: 'default', devices, networks: [], wlans: [], firewallRules: [],
    clients: [
      { mac: 'c1', hostname: 'phone', ip: '192.168.14.50', network: 'LAN', vlan: null,
        wired: false, apMac: 'achd', oui: 'Apple' },
      { mac: 'c2', hostname: 'tv', ip: '192.168.14.51', network: 'LAN', vlan: null,
        wired: false, apMac: 'mesh', oui: 'Samsung' },
      { mac: 'c3', hostname: 'laptop', ip: '192.168.14.52', network: 'LAN', vlan: null,
        wired: false, apMac: 'nano', oui: 'Dell' },
    ],
    portProfiles: [],
  },
};

const estate = m.estateFromSnapshot(snapshot, [], m.hu);
const flowsFor = (nodes) =>
  m.buildFlows({ nodes, links: estate.links, palette: m.PALETTES.light, accent: '#0b74d8',
    focus: null, showLogical: true, showEstimated: true, animate: false }).flows;

/* ------------------------------------------------------------- measurement */

function polyline(d, steps = 28) {
  const n = d.match(/-?\d+(\.\d+)?/g).map(Number);
  const q = [{ x: n[0], y: n[1] }, { x: n[2], y: n[3] }, { x: n[4], y: n[5] }, { x: n[6], y: n[7] }];
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

/*
 * Which cable a drawn strand belongs to.
 *
 * One link is drawn as several strands — an under-stroke, a dashed overlay,
 * and a second direction where the traffic runs both ways — so counting
 * strand pairs multiplies the answer. What someone looking at the map counts
 * is cables, so the strands are folded back onto the cable first.
 */
function cableOf(line, nodes) {
  const nearest = (p) =>
    nodes.reduce(
      (best, nd) => {
        const dx = p.x - (nd.x + m.NODE_W / 2);
        const dy = p.y - (nd.y + m.NODE_H / 2);
        const d = dx * dx + dy * dy;
        return d < best.d ? { d, id: nd.id } : best;
      },
      { d: Infinity, id: '?' },
    ).id;
  return [nearest(line[0]), nearest(line[line.length - 1])].sort().join('~');
}

function tangle(flows, nodes) {
  const lines = flows.map((f) => polyline(f.d));
  const cable = lines.map((l) => cableOf(l, nodes));

  const crossed = new Set();
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) {
      if (cable[i] === cable[j]) continue;
      let hit = false;
      for (let a = 1; a < lines[i].length - 2 && !hit; a++)
        for (let b = 1; b < lines[j].length - 2 && !hit; b++)
          if (crosses(lines[i][a], lines[i][a + 1], lines[j][b], lines[j][b + 1])) hit = true;
      if (hit) crossed.add([cable[i], cable[j]].sort().join(' × '));
    }
  const crossings = crossed.size;
  globalThis.__pairs = [...crossed];

  /*
   * The tightest gap between two different cables, away from the cards they
   * share. Two lines that merely graze are as hard to follow as two that
   * cross, so this is measured alongside the crossings.
   */
  const dist = (p, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy;
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  };
  const scan = (skip) => {
    let gap = Infinity;
    let pair = '';
    let at = null;
    let shared = false;
    for (let i = 0; i < lines.length; i++)
      for (let j = i + 1; j < lines.length; j++) {
        if (cable[i] === cable[j]) continue;
        const ends = new Set([...cable[i].split('~'), ...cable[j].split('~')]);
        const sharesCard = ends.size < 4;
        for (let a = skip; a < lines[i].length - skip; a++)
          for (let b = skip; b < lines[j].length - skip - 1; b++) {
            const d = dist(lines[i][a], lines[j][b], lines[j][b + 1]);
            if (d < gap) {
              gap = d;
              pair = [cable[i], cable[j]].join(' × ');
              at = lines[i][a];
              shared = sharesCard;
            }
          }
      }
    // How far the tightest point is from the nearest card, so a gap right
    // beside a device can be told from one out in the open.
    const near = at
      ? Math.round(Math.min(...nodes.map((nd) =>
          Math.hypot(
            Math.max(nd.x - at.x, 0, at.x - (nd.x + m.NODE_W)),
            Math.max(nd.y - at.y, 0, at.y - (nd.y + m.NODE_H)),
          ))))
      : null;
    return { gap: Math.round(gap * 10) / 10, pair, shared, fromCard: near };
  };

  globalThis.__tightest = scan(4);
  globalThis.__tightestFull = scan(0);
  let throughCards = 0;
  for (const line of lines) {
    const own = nodes.filter((nd) => {
      const near = (p) => Math.abs(p.x - (nd.x + m.NODE_W / 2)) < m.NODE_W &&
                          Math.abs(p.y - (nd.y + m.NODE_H / 2)) < m.NODE_H;
      return near(line[0]) || near(line[line.length - 1]);
    });
    const hit = line.slice(3, -3).some((p) =>
      nodes.filter((nd) => !own.includes(nd)).some((nd) =>
        p.x > nd.x + 4 && p.x < nd.x + m.NODE_W - 4 &&
        p.y > nd.y + 4 && p.y < nd.y + m.NODE_H - 4));
    if (hit) throughCards++;
  }
  return { crossings, throughCards };
}

/* -------------------- baseline: the order the controller returned things in */

const TIER = (n) =>
  n.kind === 'gateway' || n.kind === 'cloud' ? 0
  : n.kind === 'switch' || n.kind === 'host' ? 1
  : n.kind === 'ap' || n.kind === 'ct' || n.kind === 'vm' ? 2 : 3;

const rows = [[], [], [], []];
for (const n of estate.nodes) rows[TIER(n)].push(n);
const unordered = rows.flatMap((row, tier) => {
  const width = row.length * m.NODE_W + (row.length - 1) * 80;
  const startX = Math.round((1821 - width) / 2);
  return row.map((n, j) => ({ ...n, x: startX + j * (m.NODE_W + 80), y: 24 + tier * 186 }));
});

const before = tangle(flowsFor(unordered), unordered);
const beforePairs = [...globalThis.__pairs];
const beforeGap = globalThis.__tightest;
const after = tangle(flowsFor(estate.nodes), estate.nodes);
const afterPairs = [...globalThis.__pairs];
const afterGap = globalThis.__tightest;
const afterGapFull = globalThis.__tightestFull;
const label = new Map(estate.nodes.map((n) => [n.id, n.name]));
const pretty = (p) =>
  p.split(' × ').map((c) => c.split('~').map((id) => label.get(id) ?? id).join('–')).join('   ×   ');

console.log(`nodes ${estate.nodes.length}   edges ${flowsFor(estate.nodes).length}`);
console.log(`crossings      collection order ${before.crossings}   →  ordered ${after.crossings}`);
console.log(`through cards                   ${before.throughCards}   →           ${after.throughCards}`);
console.log(`tightest gap, mid-run        ${beforeGap.gap}px   →  ${afterGap.gap}px`);
console.log(
  `tightest gap, whole cable    ${afterGapFull.gap}px  ` +
    `${afterGapFull.fromCard}px from a card, ` +
    `${afterGapFull.shared ? 'they share a card' : 'separate cards'}`,
);
console.log(`   ${pretty(afterGapFull.pair)}`);
console.log('\nrows as placed:');
for (const tier of [0, 1, 2, 3]) {
  const row = estate.nodes.filter((n) => TIER(n) === tier).sort((a, b) => a.x - b.x);
  if (row.length) console.log(`  ${row.map((n) => `${n.name}@${n.x}`).join('   ')}`);
}

if (afterPairs.length) {
  console.log('\nstill crossing:');
  for (const p of afterPairs) console.log('  ' + pretty(p));
} else if (beforePairs.length) {
  console.log('\nwere crossing before:');
  for (const p of beforePairs) console.log('  ' + pretty(p));
}

let fail = 0;
if (after.crossings > 0) { console.log(`\nFAIL ${after.crossings} crossing(s) remain`); fail = 1; }
if (after.throughCards > 0) { console.log(`FAIL ${after.throughCards} edge(s) run through a card`); fail = 1; }
console.log(fail ? '\nFAILED' : '\nOK');
process.exit(fail);
