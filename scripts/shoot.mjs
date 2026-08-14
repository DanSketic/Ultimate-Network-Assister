// Captures the documentation screenshots from the browser build.
//
//   npm run dev          # in one terminal
//   npm run shoot
//
// Each view is loaded with `?view=<name>&lang=en&theme=<theme>`, which seeds the
// starting view, language and theme without touching anything the user has
// stored. Rendering happens in headless Edge or Chrome at 2x, so the images stay
// crisp on high-DPI displays.
//
// These come from the browser build, so they show the sample estate. That is on
// purpose: a capture of a real survey carries its addresses, host names and
// topology, and those have no business in a public repository.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'docs/media/screenshots');
const URL_BASE = process.env.UNA_URL ?? 'http://localhost:1420';
// Light by default: the images sit in a README that is read on a white page,
// and a dark capture there reads as a hole rather than as a screenshot.
const THEME = process.env.UNA_THEME ?? 'light';

/** Each view, the size it is captured at, and any extra query it needs. */
const SHOTS = [
  { name: 'topology', size: [1600, 1000], query: 'fit=1' },
  { name: 'policy', size: [1600, 1000], query: 'sub=policy', view: 'topology' },
  { name: 'overview', size: [1600, 1000] },
  { name: 'advice', size: [1600, 1000] },
  { name: 'backup', size: [1600, 1000] },
  { name: 'survey', size: [1600, 1000] },
  { name: 'planner', size: [1600, 1000] },
  { name: 'ssh', size: [1600, 1000] },
  { name: 'kb', size: [1600, 1000] },
];

const CANDIDATES = [
  process.env.UNA_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const browser = CANDIDATES.find((p) => existsSync(p));
if (!browser) {
  console.error('No Chrome or Edge found. Set UNA_BROWSER to the executable path.');
  process.exit(1);
}

// Without this check a stopped dev server yields eight screenshots of the
// browser's "can't reach this page", which is easy to miss and worse than none.
try {
  const probe = await fetch(URL_BASE, { signal: AbortSignal.timeout(3000) });
  if (!probe.ok) throw new Error(`HTTP ${probe.status}`);
} catch (err) {
  console.error(`${URL_BASE} is not serving the application (${err.message}).`);
  console.error('Start it first:  npm run dev');
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

for (const { name, size: [width, height], query, view } of SHOTS) {
  const file = resolve(OUT, `${name}.png`);
  // A fresh profile per capture: a browser process that lingers after one run
  // otherwise holds the profile lock and stalls the next one.
  const profile = mkdtempSync(join(tmpdir(), 'una-shot-'));
  // Most captures are named after the view they open; a few are a sub-view of
  // one, and say which.
  const url = `${URL_BASE}/?view=${view ?? name}&lang=en&theme=${THEME}${query ? `&${query}` : ''}`;

  try {
    execFileSync(
      browser,
      [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--no-first-run',
        '--no-default-browser-check',
        '--force-device-scale-factor=2',
        `--user-data-dir=${profile}`,
        `--window-size=${width},${height}`,
        // Give React, the fonts and the layout time to settle.
        '--virtual-time-budget=8000',
        `--screenshot=${file}`,
        url,
      ],
      { stdio: 'ignore', timeout: 90_000 },
    );
    console.log(`docs/media/screenshots/${name}.png  ${width}x${height} @2x`);
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
}
