import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
/*
 * Checks the two things the fit has to get right at once: a cable that bows
 * outside the cards still ends up on screen, and the estate still looks
 * centred while that happens.
 */
import { build } from 'esbuild';
import { rmSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const OUT = join(tmpdir(), 'fit-bundle-' + process.pid + '.mjs').replace(/\\/g, '/');

await build({
  entryPoints: [`${ROOT}/src/lib/fit.ts`],
  bundle: true,
  format: 'esm',
  outfile: OUT,
  platform: 'neutral',
  alias: { '@': `${ROOT}/src` },
  logLevel: 'error',
});
const { frameFor, FIT_PAD } = await import(`file://${OUT}`);
const { NODE_W, NODE_H } = await import(`file://${OUT.replace('fit-bundle', 'geo-bundle')}`).catch(
  () => ({ NODE_W: 176, NODE_H: 76 }),
);

const VIEW = { available: 954, usable: 702, zoomMin: 0.35, zoomMax: 1.4 };

/** Three cards in a row: 0..176, 400..576, 800..976. Centre is x = 488. */
const nodes = [
  { x: 0, y: 0 },
  { x: 400, y: 200 },
  { x: 800, y: 0 },
];
const CENTRE_X = 488;
const CENTRE_Y = (0 + (200 + NODE_H)) / 2;

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '   ' + detail : ''}`);
  if (!ok) failures += 1;
};

/* ------------------------------------------------ nothing hanging outside */

const plain = frameFor({ ...VIEW, nodes, ports: [], radios: [], drawn: null });
check('centre is the cards', plain.centreX === CENTRE_X, `centreX ${plain.centreX}`);
check(
  'frame is symmetric',
  plain.centreX - plain.frame.minX === plain.frame.maxX - plain.centreX,
  `${plain.centreX - plain.frame.minX} vs ${plain.frame.maxX - plain.centreX}`,
);
check(
  'frame is the cards plus padding',
  plain.frame.minX === -FIT_PAD && plain.frame.maxX === 976 + FIT_PAD,
  `${plain.frame.minX}..${plain.frame.maxX}`,
);

/* --------------------------------- a cable bowing 400 past the right edge */

const bowed = frameFor({
  ...VIEW,
  nodes,
  ports: [], radios: [],
  drawn: { minX: 100, minY: 20, maxX: 976 + 400, maxY: 260 },
});
check('centre is unmoved by the bow', bowed.centreX === CENTRE_X, `centreX ${bowed.centreX}`);
check(
  'the bow is inside the frame',
  bowed.frame.maxX >= 1376,
  `maxX ${bowed.frame.maxX} vs bow 1376`,
);
check(
  'the same room is reserved on the empty side',
  bowed.centreX - bowed.frame.minX === bowed.frame.maxX - bowed.centreX,
  `left ${bowed.centreX - bowed.frame.minX}, right ${bowed.frame.maxX - bowed.centreX}`,
);
check('and it zooms out to make room', bowed.zoom < plain.zoom, `${bowed.zoom} < ${plain.zoom}`);

/* --------------------------------------- everything actually fits on screen */

for (const [name, fit] of [
  ['plain', plain],
  ['bowed', bowed],
]) {
  const w = (fit.frame.maxX - fit.frame.minX) * fit.zoom;
  const h = (fit.frame.maxY - fit.frame.minY) * fit.zoom;
  check(
    `${name}: framed content fits the viewport`,
    w <= VIEW.available + 0.5 && h <= VIEW.usable + 0.5,
    `${Math.round(w)}×${Math.round(h)} in ${VIEW.available}×${VIEW.usable}`,
  );
}

/* ------------------------------------------- a chip past the outermost card */

const chipped = frameFor({
  ...VIEW,
  nodes,
  ports: [{ x: 976 + 60, y: 40 }], radios: [],
  drawn: null,
});
check(
  'a chip outside the cards is framed too',
  chipped.frame.maxX >= 976 + 60 + 26,
  `maxX ${chipped.frame.maxX}`,
);
check('and the centre still holds', chipped.centreX === CENTRE_X, `centreX ${chipped.centreX}`);

/* ---------------------------------------------------- degenerate input */

check('no nodes means no fit', frameFor({ ...VIEW, nodes: [], ports: [], radios: [], drawn: null }) === null);
check(
  'a collapsed viewport means no fit',
  frameFor({ ...VIEW, available: 0, nodes, ports: [], radios: [], drawn: null }) === null,
);

/* ------------------------------ a bow on the left is mirrored to the right */

const left = frameFor({
  ...VIEW,
  nodes,
  ports: [], radios: [],
  drawn: { minX: -400, minY: 20, maxX: 900, maxY: 260 },
});
check(
  'a left-hand bow reserves the same room on the right',
  left.frame.maxX - left.centreX === left.centreX - left.frame.minX,
  `left ${left.centreX - left.frame.minX}, right ${left.frame.maxX - left.centreX}`,
);
check('mirrored both ways', left.centreX === CENTRE_X && CENTRE_Y === plain.centreY);

rmSync(OUT, { force: true });
console.log(failures === 0 ? '\nOK' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
