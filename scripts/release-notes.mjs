/*
 * The changelog section for one version, as the release body.
 *
 * The notes a release carries are the ones already written down for that
 * version, not a second description of the same work: a release whose body was
 * composed separately drifts from the changelog, and then neither can be
 * trusted. Printing nothing is a failure here, because a tag with no entry
 * means the changelog was not updated — which is the thing worth catching
 * before the installers are published, not after.
 *
 *   node scripts/release-notes.mjs 1.12.0
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const version = (process.argv[2] ?? '').trim().replace(/^v/, '');
if (!version) {
  console.error('usage: node scripts/release-notes.mjs <version>');
  process.exit(2);
}

const path = fileURLToPath(new URL('../CHANGELOG.md', import.meta.url));
const lines = readFileSync(path, 'utf8').replace(/\r\n/g, '\n').split('\n');

// Headings look like `## [1.12.0] — 2026-10-31`; the dash is an em dash and
// the date is not matched, so a release can be dated whatever it is dated.
const heading = new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\]`);
const start = lines.findIndex((l) => heading.test(l));
if (start === -1) {
  console.error(`CHANGELOG.md has no section for ${version}`);
  process.exit(1);
}

const rest = lines.slice(start + 1);
const end = rest.findIndex((l) => l.startsWith('## '));
const body = (end === -1 ? rest : rest.slice(0, end))
  // The `---` rules between sections are the file's own furniture.
  .filter((l) => l.trim() !== '---')
  .join('\n')
  .trim();

if (!body) {
  console.error(`the ${version} section in CHANGELOG.md is empty`);
  process.exit(1);
}

process.stdout.write(`${body}\n`);
