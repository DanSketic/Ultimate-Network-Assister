/*
 * Renders the sample estate's topology to a standalone SVG for the README.
 *
 *   node scripts/gen-preview.mjs
 *
 * Drawn by the application's own layout and routing code rather than traced by
 * hand, so the picture in the documentation is the picture the application
 * produces — including the tier ordering, the detours around cards and the port
 * chips. If the drawing ever regresses, this regresses with it.
 */

import { build } from 'esbuild';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const bundle = join(tmpdir(), `una-preview-${process.pid}.mjs`);

await build({
  stdin: {
    contents: `export { demoNodes, LINKS } from '${ROOT}/src/data/topology';
               export { buildFlows } from '${ROOT}/src/lib/flows';
               export { NODE_W, NODE_H } from '${ROOT}/src/lib/geometry';
               export { PALETTES } from '${ROOT}/src/lib/palette';`,
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  outfile: bundle,
  platform: 'node',
  logLevel: 'error',
});

const m = await import('file://' + bundle.replace(/\\/g, '/'));
const { demoNodes, LINKS, buildFlows, NODE_W, NODE_H, PALETTES } = m;

for (const [theme, palette] of Object.entries(PALETTES)) {
  const nodes = demoNodes('en');
  const accent = palette.accent;
  const { flows, ports } = buildFlows({
    nodes,
    links: LINKS,
    palette,
    accent,
    focus: null,
    showLogical: true,
    showEstimated: true,
    animate: false,
  });

  const pad = 46;
  const minX = Math.min(...nodes.map((n) => n.x)) - pad;
  const minY = Math.min(...nodes.map((n) => n.y)) - pad;
  const maxX = Math.max(...nodes.map((n) => n.x + NODE_W)) + pad;
  const maxY = Math.max(...nodes.map((n) => n.y + NODE_H)) + pad;

  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  const bg = theme === 'dark' ? '#0a0d11' : '#eaeef3';
  const text = theme === 'dark' ? '#e7edf4' : '#0f1720';
  const muted = palette.textMuted;

  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" width="${Math.round(maxX - minX)}" height="${Math.round(maxY - minY)}" font-family="system-ui, sans-serif">`,
    `<rect x="${minX}" y="${minY}" width="${maxX - minX}" height="${maxY - minY}" fill="${bg}"/>`,
  ];

  for (const f of flows) {
    parts.push(
      `<path d="${f.d}" fill="none" stroke="${f.color}" stroke-width="${f.baseWidth}" opacity="${f.baseOpacity}"/>`,
      `<path d="${f.d}" fill="none" stroke="${f.color}" stroke-width="${f.width}" stroke-dasharray="${f.dash}" opacity="${f.opacity}"/>`,
    );
  }

  for (const n of nodes) {
    parts.push(
      `<rect x="${n.x}" y="${n.y}" width="${NODE_W}" height="${NODE_H}" rx="12" fill="${palette.card}" stroke="${palette.line}"/>`,
      `<circle cx="${n.x + 26}" cy="${n.y + 26}" r="7" fill="${palette[n.status] ?? muted}"/>`,
      `<text x="${n.x + 44}" y="${n.y + 30}" font-size="12.5" font-weight="600" fill="${text}">${esc(n.name.slice(0, 18))}</text>`,
      `<text x="${n.x + 14}" y="${n.y + 56}" font-size="10.5" fill="${muted}" font-family="ui-monospace, monospace">${esc((n.subtitle ?? '').slice(0, 30))}</text>`,
    );
  }

  for (const p of ports) {
    parts.push(
      `<line x1="${p.ax}" y1="${p.ay}" x2="${p.x}" y2="${p.y}" stroke="${palette.line2}" stroke-width="1"/>`,
      `<rect x="${p.x - 17}" y="${p.y - 11}" width="34" height="22" rx="6" fill="${palette.card}" stroke="${palette.line}"/>`,
      `<rect x="${p.x - 13}" y="${p.y - 7}" width="13" height="13" rx="4" fill="${p.color}"/>`,
      `<text x="${p.x + 4}" y="${p.y + 4}" font-size="10" fill="${text}" font-family="ui-monospace, monospace">${esc(p.port)}</text>`,
    );
  }

  parts.push('</svg>');

  mkdirSync(join(ROOT, 'docs', 'media'), { recursive: true });
  const out = join(ROOT, 'docs', 'media', `topology-${theme}.svg`);
  writeFileSync(out, parts.join('\n'));
  console.log(`docs/media/topology-${theme}.svg  ${Math.round(maxX - minX)}x${Math.round(maxY - minY)}`);
}

rmSync(bundle, { force: true });
