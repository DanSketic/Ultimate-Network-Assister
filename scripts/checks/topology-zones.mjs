/*
 * The outlines that say what belongs with what.
 *
 * The map answers "what is wired to what" and said nothing about which cards
 * are the same part of the estate. An outline round a run of same-zone cards
 * does — but only if it encloses exactly those cards: a boundary that swallows
 * a card from another zone is not a hint, it is a false statement, and it is
 * the one failure mode worth a check of its own.
 */
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { rmSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const OUT = join(tmpdir(), 'zones-bundle-' + process.pid + '.mjs').replace(/\\/g, '/');

await build({
  stdin: {
    contents: `export { zoneAreas, familyAreas, familyOf, labelSpot, labelSize, outlineEdges } from '${ROOT}/src/lib/zones';
               export { estateFromSnapshot } from '${ROOT}/src/survey/mapping';
               export { demoEstate } from '${ROOT}/src/state/useEstate';
               export { dict } from '${ROOT}/src/i18n/index';
               export { NODE_W, NODE_H, CHIP_W, CHIP_H } from '${ROOT}/src/lib/geometry';
               export { buildFlows } from '${ROOT}/src/lib/flows';
               export { PALETTES } from '${ROOT}/src/lib/palette';`,
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true, format: 'esm', outfile: OUT, platform: 'neutral',
  alias: { '@': `${ROOT}/src` }, logLevel: 'error',
  define: { __APP_VERSION__: '"0.0.0"' },
});
const { zoneAreas, familyAreas, familyOf, labelSpot, labelSize, outlineEdges, estateFromSnapshot, demoEstate, dict, NODE_W, NODE_H, CHIP_W, CHIP_H, buildFlows, PALETTES } =
  await import(`file://${OUT}`);
const hu = dict('hu');

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '   ' + detail : ''}`);
  if (!ok) failures += 1;
};

const card = (id, x, y, zone) => ({
  id, kind: 'switch', name: id, subtitle: '', status: 'ok', x, y, zone,
  facts: [], metrics: [], services: [], warnings: [],
});

const encloses = (area, node) =>
  node.x >= area.x && node.x + NODE_W <= area.x + area.w &&
  node.y >= area.y && node.y + NODE_H <= area.y + area.h;

/* ------------------------------------------------------- what gets an outline */

const row = [
  card('a', 0, 0, 'Mgmt'),
  card('b', 256, 0, 'Mgmt'),
  card('c', 512, 0, 'Servers'),
];
const areas = zoneAreas(row);
check('neighbours of one zone are outlined together', areas[0]?.count === 2, String(areas[0]?.count));
check('with both cards inside', areas[0] && row.slice(0, 2).every((n) => encloses(areas[0], n)));
check('and the foreign card outside', areas[0] && !encloses(areas[0], row[2]));
check('which gets an outline of its own', areas.length === 2 && areas[1]?.zone === 'Servers');

/*
 * Every card is inside an outline, a card on its own included: one left out
 * reads as one the estate could not place, and there is no such card.
 */
const alone = zoneAreas([card('a', 0, 0, 'Mgmt'), card('b', 256, 0, 'Servers')]);
check('a card on its own is outlined too', alone.length === 2, String(alone.length));

const spread = zoneAreas([card('a', 0, 0, 'Mgmt'), card('b', 700, 0, 'Mgmt')]);
check('empty space does not break a run of one zone', spread.length === 1, String(spread.length));

const interrupted = [
  card('a', 0, 0, 'Mgmt'),
  card('b', 256, 0, 'Servers'),
  card('c', 512, 0, 'Mgmt'),
];
const parted = zoneAreas(interrupted);
check('but a card of another zone does', parted.length === 3, String(parted.length));
check('and none of the three encloses a foreign card',
  parted.every((area) =>
    interrupted.filter((n) => n.zone !== area.zone).every((n) => !encloses(area, n)),
  ));

/* --------------------------------------------------------------- rows */

const twoRows = zoneAreas([
  card('a', 0, 0, 'Servers'),
  card('b', 256, 0, 'Servers'),
  card('c', 0, 186, 'Servers'),
  card('d', 256, 186, 'Servers'),
]);
check('a zone on two rows is two outlines, not one box over both',
  twoRows.length === 2, String(twoRows.length));
check('and neither reaches into the other row',
  twoRows.every((a) => a.h < 186), twoRows.map((a) => Math.round(a.h)).join(', '));

const dragged = zoneAreas([
  card('a', 0, 0, 'Servers'),
  card('b', 256, 0, 'Servers'),
  // Pulled clear of the row by hand: it leaves the group rather than
  // stretching the outline down to itself.
  card('c', 512, 300, 'Servers'),
]);
check('a card dragged out of its row leaves the outline behind',
  dragged.length === 2 && dragged[0].count === 2 && dragged[1].count === 1,
  JSON.stringify(dragged.map((a) => a.count)));

/* ------------------------------------------- nothing encloses a foreign card */

const port = (idx, o = {}) => ({
  idx, name: '', up: true, enabled: true, speed: 1000, fullDuplex: true, poeEnabled: false,
  poePower: '', portConfId: '', taggedVlanMgmt: '', neighbourMac: '', neighbourName: '',
  neighbourPort: '', isUplink: false, ...o,
});
const dev = (mac, name, kind, o = {}) => ({
  mac, name, model: kind.toUpperCase(), kind, state: 1, ip: '10.0.1.9', version: '7.0',
  uptimeSecs: 9e4, clients: 2, uplinkMac: '', uplinkRemotePort: 0, uplinkLocalPort: 0,
  ports: [], radios: [], ...o,
});
const guest = (vmid, name) => ({
  vmid, name, kind: 'qemu', node: 'pve01', status: 'running', cpuCount: 2, memTotal: 4e9,
  diskTotal: 3e10, tags: '', nics: [{ name: 'net0', model: 'virtio', mac: 'AA', bridge: 'vmbr0',
    vlan: null, firewall: false }],
});

const surveyed = estateFromSnapshot(
  {
    id: 's', startedAt: '', finishedAt: '', log: [], errors: [],
    proxmox: {
      version: '8.2',
      nodes: [{ name: 'pve01', status: 'online', cpuRatio: 0.2, cpuCount: 8, memUsed: 8e9,
        memTotal: 32e9, uptimeSecs: 9e4 }],
      storages: [
        { node: 'pve01', name: 'local', kind: 'dir', total: 1e11, used: 2e10, available: 8e10,
          enabled: true, content: 'images', active: true },
        { node: 'pve01', name: 'tank', kind: 'zfspool', total: 2e12, used: 1e12, available: 1e12,
          enabled: true, content: 'images', active: true },
      ],
      guests: [guest(101, 'one'), guest(102, 'two'), guest(103, 'three')],
      interfaces: [{ node: 'pve01', name: 'vmbr0', kind: 'bridge', address: '10.0.1.10',
        cidr: '10.0.1.10/24', bridgePorts: 'eno1', vlanAware: true, active: true }],
      disks: [], backupJobs: [], backupFiles: [], certificates: [], updates: [],
      updatesReadable: false,
    },
    unifi: {
      site: 'default',
      devices: [
        dev('gw', 'Gateway', 'udm', { ports: [port(3, { neighbourMac: 'sw' })] }),
        dev('sw', 'Switch', 'usw', { uplinkMac: 'gw', uplinkRemotePort: 3 }),
        dev('ap1', 'AP one', 'uap', { uplinkMac: 'sw', uplinkRemotePort: 5 }),
        dev('ap2', 'AP two', 'uap', { uplinkMac: 'sw', uplinkRemotePort: 6 }),
      ],
      networks: [], wlans: [], firewallRules: [],
      clients: [{ mac: 'c3', hostname: 'pve01', ip: '10.0.1.10', network: 'M', vlan: 1,
        wired: true, apMac: '', oui: 'Intel', switchMac: 'sw', switchPort: 9 }],
      portProfiles: [], wans: [],
    },
  },
  [],
  hu,
);

const surveyedAreas = zoneAreas(surveyed.nodes);
const foreign = surveyedAreas.flatMap((a) =>
  surveyed.nodes.filter((n) => n.zone !== a.zone && encloses(a, n)).map((n) => `${n.name} in ${a.zone}`),
);
check('on a surveyed estate no outline encloses a card of another zone',
  foreign.length === 0, foreign.join(', '));

const twice = surveyed.nodes.filter(
  (n) => surveyedAreas.filter((a) => encloses(a, n)).length > 1,
);
check('and no card falls inside two outlines', twice.length === 0, twice.map((n) => n.name).join(', '));

/*
 * The ordering pass gathers zones where it costs nothing, so the three guests
 * of one hypervisor end up as one group rather than three.
 */
const guests = surveyedAreas.find((a) => a.zone === 'Servers' && a.count >= 3);
check('same-zone cards are gathered so they can be outlined at all',
  guests !== undefined, surveyedAreas.map((a) => `${a.zone}×${a.count}`).join(' '));

const outside = surveyed.nodes.filter((n) => !surveyedAreas.some((a) => encloses(a, n)));
check('and every card on the map is inside one',
  outside.length === 0, outside.map((n) => n.name).join(', '));

/* ------------------------------------------------------------------ the demo */

for (const lang of ['hu', 'en']) {
  const demo = demoEstate(lang, '');
  const demoAreas = zoneAreas(demo.nodes);
  const wrong = demoAreas.flatMap((a) =>
    demo.nodes.filter((n) => n.zone !== a.zone && encloses(a, n)).map((n) => n.name),
  );
  const stray = demo.nodes.filter((n) => !demoAreas.some((a) => encloses(a, n)));
  check(`the demo estate outlines only its own zones (${lang})`,
    demoAreas.length > 0 && wrong.length === 0,
    `${demoAreas.length} outlines${wrong.length ? ', wrong: ' + wrong.join(', ') : ''}`);
  check(`and leaves no card out of them (${lang})`,
    stray.length === 0, stray.map((n) => n.name).join(', '));
}

/* ------------------------------------------------------- the outer grouping */

/*
 * The outer boundary is a rectangle, and that is the whole point of it: the
 * layout keeps each family in its own column so that one straight box fits
 * round it. What has to hold is that the box encloses its own family and
 * touches nobody else's card.
 */
const overlaps = (area, node) =>
  node.x < area.x + area.w &&
  area.x < node.x + NODE_W &&
  node.y < area.y + area.h &&
  area.y < node.y + NODE_H;

const holds = (area, node) =>
  node.x >= area.x && node.x + NODE_W <= area.x + area.w &&
  node.y >= area.y && node.y + NODE_H <= area.y + area.h;

const auditFamilies = (estate, label) => {
  const shapes = familyAreas(estate.nodes);

  const foreign = shapes.flatMap((area) =>
    estate.nodes
      .filter((n) => familyOf(n.kind) !== area.family && overlaps(area, n))
      .map((n) => `${n.name} in ${area.family}`),
  );
  check(`no family outline touches a card of another family (${label})`,
    foreign.length === 0, foreign.join(', '));

  const homeless = estate.nodes.filter(
    (n) => !shapes.some((area) => area.family === familyOf(n.kind) && holds(area, n)),
  );
  check(`every card is inside its own family outline (${label})`,
    homeless.length === 0, homeless.map((n) => n.name).join(', '));

  // One box per family, not one per row: a hypervisor with nothing on the
  // access-point row is still one hypervisor.
  const perFamily = new Map();
  for (const area of shapes) perFamily.set(area.family, (perFamily.get(area.family) ?? 0) + 1);
  const split = [...perFamily].filter(([, n]) => n > 1);
  check(`each family is one outline (${label})`,
    split.length === 0, split.map(([f, n]) => `${f}: ${n}`).join(', '));

  return shapes;
};

/*
 * No two boundaries may run side by side.
 *
 * An inner line a dozen pixels inside an outer one reads as a single doubled
 * dashed line, which says neither of the two things the two lines are for. The
 * clearance is measured rather than assumed, because it comes out of two
 * paddings set in different places.
 */
const CLEARANCE = 20;

/*
 * Nothing may overlap and nothing may touch.
 *
 * Two boundaries a few pixels apart are read as one doubled line, and two that
 * cross say the map cannot make up its mind about who belongs where. The only
 * pair allowed to share space is an inner outline inside its own outer one.
 */
const auditSpacing = (estate, label) => {
  const boxes = [
    ...familyAreas(estate.nodes).map((a) => ({ kind: 'family', name: a.family, ...a })),
    ...zoneAreas(estate.nodes).map((a) => ({ kind: 'zone', name: a.zone, ...a })),
  ];

  const nested = (a, b) =>
    b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h;
  const apart = (a, b) =>
    Math.max(
      Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)),
      Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)),
    );

  let tightest = Infinity;
  let where = '';
  const crossing = [];
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (nested(a, b) || nested(b, a)) continue;
      const gap = apart(a, b);
      if (gap < 0) crossing.push(`${a.kind}:${a.name} x ${b.kind}:${b.name}`);
      if (gap < tightest) {
        tightest = gap;
        where = `${a.kind}:${a.name} / ${b.kind}:${b.name}`;
      }
    }

  check(`no two outlines overlap (${label})`, crossing.length === 0, crossing.join(', '));
  check(`and none of them touch (${label})`,
    tightest >= CLEARANCE, `${Math.round(tightest)}px  ${where}`);
};

const auditClearance = (estate, label) => {
  const shapes = familyAreas(estate.nodes);
  const inner = zoneAreas(estate.nodes);

  const crossing = inner.filter(
    (z) => !shapes.some((f) => holds(f, { x: z.x, y: z.y }) && holds(f, { x: z.x + z.w - NODE_W, y: z.y + z.h - NODE_H })),
  );
  check(`every zone outline is inside one family outline (${label})`,
    crossing.length === 0, crossing.map((z) => `${z.zone}x${z.count}`).join(', '));

  let tightest = Infinity;
  for (const z of inner) {
    const around = shapes.find(
      (f) => z.x >= f.x && z.y >= f.y && z.x + z.w <= f.x + f.w && z.y + z.h <= f.y + f.h,
    );
    if (!around) continue;
    tightest = Math.min(
      tightest,
      z.x - around.x,
      around.x + around.w - (z.x + z.w),
      z.y - around.y,
      around.y + around.h - (z.y + z.h),
    );
  }
  check(`the inner and outer boundaries stay apart (${label})`,
    tightest >= CLEARANCE, `${Math.round(tightest)}px`);

  let between = Infinity;
  for (let i = 0; i < shapes.length; i++)
    for (let j = i + 1; j < shapes.length; j++) {
      const a = shapes[i];
      const b = shapes[j];
      const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w));
      const dy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h));
      between = Math.min(between, Math.max(dx, dy));
    }
  check(`and no two family outlines touch (${label})`,
    between >= CLEARANCE, `${Math.round(between)}px`);
};

const surveyedFamilies = auditFamilies(surveyed, 'surveyed');
const proxmox = surveyedFamilies.find((area) => area.family === 'proxmox');
const unifi = surveyedFamilies.find((area) => area.family === 'unifi');
check('the hypervisor, its bridge, its guests and its stores are one shape',
  proxmox?.count === 7, String(proxmox?.count));
// Four: the gateway, the switch and the two access points. The only client
// this estate has is the hypervisor, which is a card of its own.
check('and the controller with its own devices another',
  unifi?.count === 4, String(unifi?.count));
check('and the two do not touch',
  proxmox !== undefined && unifi !== undefined &&
    (proxmox.x >= unifi.x + unifi.w || unifi.x >= proxmox.x + proxmox.w),
  proxmox && unifi ? `unifi ${Math.round(unifi.x)}..${Math.round(unifi.x + unifi.w)}  proxmox ${Math.round(proxmox.x)}..${Math.round(proxmox.x + proxmox.w)}` : '');

auditClearance(surveyed, 'surveyed');
auditSpacing(surveyed, 'surveyed');

for (const lang of ['hu', 'en']) {
  const demo = demoEstate(lang, '');
  auditFamilies(demo, `demo ${lang}`);
  auditClearance(demo, `demo ${lang}`);
  auditSpacing(demo, `demo ${lang}`);
}

/* ------------------------------------------------------------------ labels */

/*
 * A name in a corner is a name in the way.
 *
 * The corner an outline wants for its label is where a cable comes down into
 * the first card of the group, and the port number riding on that cable lands
 * in the same place. The chip wins — it belongs to one cable, while the name
 * belongs to an area with three other corners.
 */
const hits = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const box = { x: 0, y: 0, w: 600, h: 200, padTop: 40, padBottom: 40 };
const clear = labelSpot(box, labelSize('MANAGEMENT', false), []);
check('a label takes the top-left corner when it is free',
  clear.x < box.x + 30 && clear.y < box.y + 30, `${Math.round(clear.x)}, ${Math.round(clear.y)}`);

const chip = { x: 10, y: 0, w: 52, h: 28 };
const dodged = labelSpot(box, labelSize('MANAGEMENT', false), [chip]);
check('and another corner when a port chip is sitting in it',
  !hits(dodged, chip), `${Math.round(dodged.x)}, ${Math.round(dodged.y)}`);
check('without leaving its own outline',
  dodged.x >= box.x && dodged.y >= box.y &&
    dodged.x + dodged.w <= box.x + box.w && dodged.y + dodged.h <= box.y + box.h);

const crowded = labelSpot(box, labelSize('MANAGEMENT', false), [
  { x: 0, y: 0, w: 600, h: 200 },
]);
check('a group boxed in on every side still gets its name',
  crowded !== undefined && crowded.w > 0);

/*
 * The whole map: every outline's name, against the chips and against each
 * other. The families are named first, so a zone gives way rather than the
 * other way round.
 */
const auditLabels = (estate, label) => {
  // The chips the canvas actually draws: one per port number on a cable, at
  // the spot the flow builder puts it.
  const chips = buildFlows({
    nodes: estate.nodes, links: estate.links, palette: PALETTES.light, accent: '#0b74d8',
    focus: null, showLogical: true, showEstimated: true, animate: false,
  }).ports.map((p) => ({ x: p.x - CHIP_W / 2, y: p.y - CHIP_H / 2, w: CHIP_W, h: CHIP_H }));
  const outlines = [...familyAreas(estate.nodes), ...zoneAreas(estate.nodes)];
  const edges = outlines.map((area) => ({ area, bands: outlineEdges(area) }));
  const others = (mine) => edges.filter((e) => e.area !== mine).flatMap((e) => e.bands);

  const taken = [];
  const placed = [];

  for (const area of familyAreas(estate.nodes)) {
    const mine = outlines.find((o) => o.family === area.family && o.x === area.x);
    const spot = labelSpot(area, labelSize(hu.topology.familyName[area.family], true),
      [...chips, ...taken], others(mine));
    taken.push(spot);
    placed.push({ name: hu.topology.familyName[area.family], spot, mine });
  }
  for (const area of zoneAreas(estate.nodes)) {
    const mine = outlines.find((o) => o.zone === area.zone && o.x === area.x && o.y === area.y);
    const spot = labelSpot(area, labelSize(hu.topology.zoneName[area.zone], false),
      [...chips, ...taken], others(mine));
    taken.push(spot);
    placed.push({ name: hu.topology.zoneName[area.zone], spot, mine });
  }

  /*
   * A name may sit inside a boundary; on one it is unreadable, and so is the
   * line. The inner outline running through the outer one's name is the same
   * mistake as a name under a port chip.
   */
  const onLines = placed.filter((p) =>
    edges.some((e) => e.area !== p.mine && e.bands.some((b) => hits(p.spot, b))),
  );
  // Reported rather than failed: where a name cannot avoid both, a line under
  // it is the lesser evil — the name has a ground of its own, so the line is
  // hidden rather than muddled, whereas a covered chip is a number lost.
  console.log(`      names resting on a line (${label}): ` +
    (onLines.length === 0 ? 'none' : onLines.map((p) => p.name).join(', ')));

  const clashes = [];
  for (let i = 0; i < placed.length; i++)
    for (let j = i + 1; j < placed.length; j++)
      if (hits(placed[i].spot, placed[j].spot)) clashes.push(`${placed[i].name} x ${placed[j].name}`);
  check(`no two names overlap (${label})`, clashes.length === 0, clashes.join(', '));

  const onChips = placed.filter((p) => chips.some((c) => hits(p.spot, c)));
  check(`and none of them sits on a port chip (${label})`,
    onChips.length === 0, onChips.map((p) => p.name).join(', '));

  // A name must not land on a card either: the padding bands are what keep it
  // beside the cards rather than over them.
  const onCards = placed.filter((p) =>
    estate.nodes.some((n) => hits(p.spot, { x: n.x, y: n.y, w: NODE_W, h: NODE_H })),
  );
  check(`nor on a card (${label})`, onCards.length === 0, onCards.map((p) => p.name).join(', '));
};

auditLabels(surveyed, 'surveyed');
for (const lang of ['hu', 'en']) auditLabels(demoEstate(lang, ''), `demo ${lang}`);

console.log(`\n${failures === 0 ? 'all checks passed' : failures + ' failed'}`);
rmSync(OUT, { force: true });
process.exit(failures === 0 ? 0 : 1);
