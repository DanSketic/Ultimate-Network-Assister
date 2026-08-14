// Generates the app icons from the design's own topology mark: a blue rounded
// square with the three-node graph from the navigation rail.
//
//   node scripts/gen-icons.mjs
//
// Everything is rasterised here so the repo carries no binary source assets.

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../src-tauri/icons");

// --- PNG encoding -----------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour + alpha
  // Each scanline is prefixed with filter type 0.
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- drawing ----------------------------------------------------------------

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const mix = (a, b, t) => a + (b - a) * t;

/** Signed distance from a point to a rounded rectangle, negative inside. */
function roundedRectDistance(x, y, half, radius) {
  const dx = Math.abs(x) - (half - radius);
  const dy = Math.abs(y) - (half - radius);
  const ox = Math.max(dx, 0);
  const oy = Math.max(dy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0) - radius;
}

/** Distance from a point to the segment a->b. */
function segmentDistance(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const t = clamp(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy), 0, 1);
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

/*
 * The plate reads as the app's accent with the gradient running across it; the
 * mark uses the app's darkest surface as ink.
 *
 * The dark end of the gradient is the accent itself rather than a shade below
 * it, and that is the whole reason this icon reads at desktop size. The lower
 * half of the mark sits over that end, and against the old darker blue it had
 * barely 4:1 to work with — at 32 or 48 pixels every edge is two pixels of
 * blend, and with that little contrast those pixels are mud. Keeping the plate
 * light holds the mark above 7:1 everywhere it is actually drawn.
 */
const PLATE_LIGHT = [0x8e, 0xcb, 0xff];
const PLATE_DARK = [0x3e, 0xa6, 0xff];
const INK = [0x0a, 0x12, 0x20];

/*
 * Topology glyph: one upstream node feeding two below it, matching the shape
 * the navigation rail uses for the topology view. Coordinates are on the
 * design's 24-unit logo grid.
 *
 * Drawn larger and heavier than the rail's version, because this one has to
 * survive being 32 pixels across on a desktop. The arms are the part that
 * suffers: they run diagonally, so anti-aliasing spreads them over an extra
 * pixel on each side, and a thin arm becomes a grey smear rather than a line.
 */
const NODES = [
  [12, 6.4],
  [6.1, 17.6],
  [17.9, 17.6],
];
const LINKS = [
  [0, 1],
  [0, 2],
];
const NODE_R = 3.2;
const LINK_HALF = 1.85;

function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const s = size / 24;
  const half = 12 * s;
  const radius = 6.2 * s;

  const nodes = NODES.map(([x, y]) => [x * s, y * s]);
  const nodeR = NODE_R * s;
  const linkHalf = LINK_HALF * s;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = x + 0.5 - size / 2;
      const cy = y + 0.5 - size / 2;

      // Plate: accent gradient along the 140deg axis of the design.
      const t = clamp((cx * 0.64 + cy * 0.77) / (size * 0.9) + 0.5, 0, 1);
      let r = mix(PLATE_LIGHT[0], PLATE_DARK[0], t);
      let g = mix(PLATE_LIGHT[1], PLATE_DARK[1], t);
      let b = mix(PLATE_LIGHT[2], PLATE_DARK[2], t);

      const plate = clamp(0.5 - roundedRectDistance(cx, cy, half, radius), 0, 1);

      // Mark: the union of the links and the nodes, so the joins stay clean.
      const px = x + 0.5;
      const py = y + 0.5;
      let cover = 0;
      for (const [a, b2] of LINKS) {
        const d = segmentDistance(px, py, nodes[a][0], nodes[a][1], nodes[b2][0], nodes[b2][1]);
        cover = Math.max(cover, clamp(linkHalf + 0.5 - d, 0, 1));
      }
      for (const [nx, ny] of nodes) {
        cover = Math.max(cover, clamp(nodeR + 0.5 - Math.hypot(px - nx, py - ny), 0, 1));
      }

      r = mix(r, INK[0], cover);
      g = mix(g, INK[1], cover);
      b = mix(b, INK[2], cover);

      const i = (y * size + x) * 4;
      rgba[i] = Math.round(r);
      rgba[i + 1] = Math.round(g);
      rgba[i + 2] = Math.round(b);
      rgba[i + 3] = Math.round(plate * 255);
    }
  }

  return rgba;
}

// --- ICO container ----------------------------------------------------------

function encodeIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);

  let offset = 6 + entries.length * 16;
  const dir = [];
  for (const { size, png } of entries) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size; // 0 means 256
    e[1] = size >= 256 ? 0 : size;
    e[2] = 0; // palette
    e[3] = 0; // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    dir.push(e);
  }

  return Buffer.concat([header, ...dir, ...entries.map((e) => e.png)]);
}

// --- main -------------------------------------------------------------------

mkdirSync(OUT, { recursive: true });

const pngFor = (size) => encodePng(size, render(size));

const files = {
  "32x32.png": 32,
  "128x128.png": 128,
  "128x128@2x.png": 256,
  "icon.png": 512,
};

for (const [name, size] of Object.entries(files)) {
  writeFileSync(resolve(OUT, name), pngFor(size));
  console.log(`icons/${name}  ${size}x${size}`);
}

const ico = encodeIco([16, 32, 48, 64, 128, 256].map((size) => ({ size, png: pngFor(size) })));
writeFileSync(resolve(OUT, "icon.ico"), ico);
console.log(`icons/icon.ico  6 sizes, ${ico.length} bytes`);
