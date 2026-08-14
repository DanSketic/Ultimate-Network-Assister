/*
 * Runs every check and reports which passed.
 *
 * These are not unit tests of functions but measurements of the things that
 * were hard to get right and easy to break again: whether the topology draws
 * without crossings, whether the fit frames everything, whether both
 * dictionaries say the same thing, whether any control on screen is wired to
 * nothing. Each one prints its own numbers, so a regression shows what moved
 * rather than only that something did.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const HERE = fileURLToPath(new URL('.', import.meta.url));

const CHECKS = readdirSync(HERE)
  .filter((name) => name.endsWith('.mjs') && name !== 'run.mjs')
  .sort();

const verbose = process.argv.includes('--verbose');
const results = [];

for (const check of CHECKS) {
  const started = Date.now();
  const run = spawnSync(process.execPath, [join(HERE, check)], {
    encoding: 'utf8',
    stdio: verbose ? 'inherit' : 'pipe',
  });
  const ms = Date.now() - started;
  const ok = run.status === 0;
  results.push({ check, ok, ms, output: run.stdout ?? '', error: run.stderr ?? '' });

  if (!ok && !verbose) {
    console.log(`\n─── ${check} ───`);
    console.log(run.stdout?.trimEnd());
    if (run.stderr?.trim()) console.log(run.stderr.trimEnd());
  }
}

console.log('');
for (const r of results) {
  console.log(`${r.ok ? 'pass' : 'FAIL'}  ${r.check.replace('.mjs', '').padEnd(22)} ${r.ms} ms`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
