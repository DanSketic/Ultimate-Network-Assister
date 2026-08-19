/*
 * The survey report.
 *
 * What is checked is not the layout but the honesty: that a report from the
 * sample data says so on its face, that a gap the survey could not fill is
 * stated rather than omitted, and that nothing a user typed can escape into
 * the markup. A document that quietly leaves out what it could not measure
 * reads as though there were nothing to leave out.
 */
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { rmSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const OUT = join(tmpdir(), 'report-bundle-' + process.pid + '.mjs').replace(/\\/g, '/');

await build({
  stdin: {
    contents: `export { surveyReport } from '${ROOT}/src/survey/report';
               export { estateFromSnapshot } from '${ROOT}/src/survey/mapping';
               export { dict } from '${ROOT}/src/i18n/index';`,
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true, format: 'esm', outfile: OUT, platform: 'neutral',
  alias: { '@': `${ROOT}/src` }, logLevel: 'error',
});
const { surveyReport, estateFromSnapshot, dict } = await import(`file://${OUT}`);
const hu = dict('hu');
const en = dict('en');

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '   ' + detail : ''}`);
  if (!ok) failures += 1;
};

const pve = (over = {}) => ({
  version: '8.2',
  nodes: [{ name: 'pve01', status: 'online', cpuRatio: 0.2, cpuCount: 8,
    memUsed: 8e9, memTotal: 32e9, uptimeSecs: 90000 }],
  storages: [], guests: [], interfaces: [], disks: [], backupJobs: [], backupJobsReadable: true,
  backupFiles: [],
  certificates: [], updates: [], updatesReadable: false, ...over,
});

const snapshot = (over = {}) => ({
  id: 's1', startedAt: '2026-08-13T08:59:00Z', finishedAt: '2026-08-13T09:00:00Z',
  log: [{ time: '09:00', source: 'pve', message: 'GET /version', ok: true }],
  errors: [], proxmox: pve(), unifi: null, ...over,
});

const reportOf = (snap, t = hu) => surveyReport(estateFromSnapshot(snap, [], t), snap, t);

/* ------------------------------------------------------------- a real survey */

const html = reportOf(snapshot());
check('it is a whole document', html.startsWith('<!doctype html>') && html.includes('</html>'));
check('it needs no network', !/https?:\/\//.test(html), (html.match(/https?:\/\/[^\s"']+/) ?? [''])[0]);
check('it carries its own styling', html.includes('<style>'));
check('the language is declared', html.includes('lang="hu"'));
check('and the English one says so too', reportOf(snapshot(), en).includes('lang="en"'));
check('it names when the survey ran', html.includes('2026-08-13 09:00'));
check('and states what it may claim', html.includes(hu.survey.provenanceNote.slice(0, 40)));

/* ---------------------------------------------------- gaps have to be visible */

const noStores = reportOf(snapshot({ proxmox: pve({ storages: [] }) }));
check(
  'a capacity figure that could not be read is explained, not omitted',
  noStores.includes(hu.findings.capacityNoStores.slice(0, 40)),
);

const withErrors = reportOf(snapshot({ errors: ['pve: 401'] }));
check('what could not be read is listed', withErrors.includes('pve: 401'));
check('under its own heading', withErrors.includes(hu.report.problems));

check(
  'no backup jobs is stated rather than left blank',
  reportOf(snapshot()).includes(hu.report.noBackups),
);

// The two ways of having nothing to show. A refused listing establishes
// nothing, and a document that renders it as "none found" would be claiming
// the survey answered a question it was not allowed to ask.
const unread = reportOf(snapshot({ proxmox: pve({ backupJobsReadable: false }) }));
check(
  'a refused backup listing is reported as unread',
  unread.includes(hu.report.backupsUnreadable),
);
check(
  'and never as "none found"',
  !unread.includes(hu.report.noBackups),
);

/* -------------------------------------------------------------- sample data */

const demoLike = reportOf(snapshot());
check('a surveyed report does not carry the sample warning', !demoLike.includes(hu.report.demoWarning));

/* --------------------------------------------------------------- escaping */

const nasty = reportOf(
  snapshot({
    errors: ['<script>alert(1)</script>', 'a & b "quoted"'],
  }),
);
check('markup in measured text cannot escape', !nasty.includes('<script>alert(1)</script>'));
check('it is shown as text instead', nasty.includes('&lt;script&gt;'));
check('and ampersands survive readably', nasty.includes('a &amp; b &quot;quoted&quot;'));

/* --------------------------------------------------------------- languages */

const huReport = reportOf(snapshot(), hu);
const enReport = reportOf(snapshot(), en);
check('both languages produce a report', huReport.length > 500 && enReport.length > 500);
check('and they differ in wording', huReport !== enReport);
check('the English one is free of Hungarian accents in its own headings',
  !new RegExp(`<h2>[^<]*[áéíóöőúüű]`, 'i').test(enReport));

rmSync(OUT, { force: true });
console.log(failures === 0 ? '\nOK' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
