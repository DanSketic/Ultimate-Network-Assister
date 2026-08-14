/*
 * Every command the catalogue offers must classify as read-only.
 *
 * The catalogue is a list of things the application suggests. Suggesting a
 * command that then demands confirmation is a small betrayal of the interface:
 * the badge says "read-only" beside a list, and the first click says otherwise.
 *
 * It has caught two already — a `2>&1` that reads as writing a file, and
 * `iptables --version`, which is not one of the forms the policy knows only
 * reads. Both looked harmless and neither was allowed.
 *
 * The classifier itself lives in Rust; this reimplements only enough of it to
 * check the catalogue, and the Rust tests hold the classifier's own behaviour.
 */
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const OUT = join(tmpdir(), 'catalogue-bundle-' + process.pid + '.mjs').replace(/\\/g, '/');

await build({
  stdin: {
    contents: `export { sshCatalogue } from '${ROOT}/src/ssh/catalogue';`,
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true, format: 'esm', outfile: OUT, platform: 'neutral',
  alias: { '@': `${ROOT}/src` }, logLevel: 'error',
});
const { sshCatalogue } = await import(`file://${OUT}`);

/* The two lists, read from the Rust source so they cannot drift apart. */
const policy = readFileSync(`${ROOT}/src-tauri/src/sshpolicy.rs`, 'utf8');
const listBetween = (name) => {
  // Anchored on the declaration exactly, because `&[&str]` in the type puts a
  // bracket before the one that opens the list — reading from the first `[`
  // swallowed both lists and made every command look destructive.
  const match = policy.match(
    new RegExp(`const ${name}: &\\[&str\\] = \\[([\\s\\S]*?)\\]\\s*\\n\\.as_slice\\(\\)`),
  );
  if (!match) throw new Error(`could not find ${name} in sshpolicy.rs`);
  // Only string literals, and not the ones inside comments.
  return match[1]
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .flatMap((line) => [...line.matchAll(/"([^"]+)"/g)].map((m) => m[1]));
};
const FORBIDDEN = listBetween('FORBIDDEN');
const READ_ONLY = listBetween('READ_ONLY');

const classify = (command) => {
  const verdicts = command.split(/[;|&\n\r]/).map((segment) => {
    const lower = segment.trim().toLowerCase();
    if (!lower) return 'readOnly';
    if (FORBIDDEN.some((needle) => lower.includes(needle))) return 'forbidden';
    if (lower.split(/\s+/).includes('dd')) return 'forbidden';
    if (lower.includes('>')) return 'mutating';
    const stripped = lower
      .replace(/^(\w+=\S*\s+)+/, '')
      .replace(/^(sudo|doas)\s+/, '');
    return READ_ONLY.some((safe) => stripped === safe || stripped.startsWith(safe + ' '))
      ? 'readOnly'
      : 'mutating';
  });
  if (verdicts.includes('forbidden')) return 'forbidden';
  if (verdicts.includes('mutating')) return 'mutating';
  return 'readOnly';
};

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '   ' + detail : ''}`);
  if (!ok) failures += 1;
};

check('the policy lists were found in the Rust source',
  FORBIDDEN.length > 10 && FORBIDDEN.length < 120 &&
    READ_ONLY.length > 30 && READ_ONLY.length < 200,
  `${FORBIDDEN.length} forbidden, ${READ_ONLY.length} read-only`);

/*
 * The reading groups have to read.
 *
 * `maintenance` is the exception, and it is one on purpose: those commands
 * change something and the interface says so before running them. Everything
 * in the other four groups is offered as an observation, and a command that
 * demands confirmation there contradicts the list it is sitting in.
 */
const READING_GROUPS = ['inventory', 'network', 'storage', 'services'];

for (const lang of ['hu', 'en']) {
  for (const flavour of ['proxmox', 'unifi', 'other']) {
    const commands = sshCatalogue(lang, flavour);
    const reading = commands.filter((c) => READING_GROUPS.includes(c.group));
    const offenders = reading
      .map((c) => ({ ...c, verdict: classify(c.command) }))
      .filter((c) => c.verdict !== 'readOnly');
    check(
      `${lang}/${flavour}: all ${reading.length} observations only read`,
      offenders.length === 0,
      offenders.map((o) => `${o.command} → ${o.verdict}`).join(' | '),
    );

    // Maintenance may change things. It may never be something the
    // application refuses outright — offering a command it will not run is
    // a dead button.
    const refused = commands
      .filter((c) => c.group === 'maintenance')
      .map((c) => ({ ...c, verdict: classify(c.command) }))
      .filter((c) => c.verdict === 'forbidden');
    check(
      `${lang}/${flavour}: nothing offered is refused outright`,
      refused.length === 0,
      refused.map((o) => o.command).join(' | '),
    );
  }
}

// Every catalogue entry needs wording in both languages, or the list shows an id.
const hu = sshCatalogue('hu', 'other');
const en = sshCatalogue('en', 'other');
check('every entry is worded in both languages',
  hu.every((c) => c.label && c.detail) && en.every((c) => c.label && c.detail));
check('and the two languages offer the same commands',
  hu.map((c) => c.command).join('|') === en.map((c) => c.command).join('|'));

rmSync(OUT, { force: true });
console.log(failures === 0 ? '\nOK' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
