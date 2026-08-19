/*
 * The survey as a document.
 *
 * A change plan and an installation guide could already be exported; what was
 * found could not. Yet "here is what I measured at your site" is the thing
 * worth handing to someone: attaching to a ticket, keeping as a record of the
 * state before a change, or sending to whoever asked for a look.
 *
 * Self-contained HTML rather than a PDF or a Markdown file, for the same reason
 * the guide is: it opens on any machine with no reader and no network, prints
 * to paper or to PDF from the browser, and can be read in a year by someone who
 * has never heard of this application.
 *
 * What it says is limited to what the survey established. Where a thing could
 * not be measured it says so, in the same words the interface uses, because a
 * document that quietly omits its gaps reads as though there were none.
 */

import type { Estate } from './mapping';
import type { Dict } from '@/i18n';
import type { SurveySnapshot } from './model';

const esc = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Renders a table, or nothing at all when there is nothing to show. */
function table(heading: string, columns: string[], rows: string[][], empty?: string): string {
  if (rows.length === 0) {
    return empty ? `<h2>${esc(heading)}</h2>\n<p class="none">${esc(empty)}</p>` : '';
  }
  return [
    `<h2>${esc(heading)}</h2>`,
    '<table>',
    `<thead><tr>${columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>`,
    '<tbody>',
    ...rows.map((r) => `<tr>${r.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`),
    '</tbody>',
    '</table>',
  ].join('\n');
}

const STYLE = `
:root{color-scheme:light dark;--bg:#fff;--fg:#111820;--muted:#5b6774;--line:#e3e8ef;
--panel:#f7f9fc;--bad:#c2352a;--warn:#9a6a04;--ok:#0f7a4f;--accent:#0b74d8}
@media (prefers-color-scheme:dark){:root{--bg:#0d1116;--fg:#e6ecf3;--muted:#93a1b0;
--line:#26303b;--panel:#141a21;--bad:#f0655a;--warn:#f2b544;--ok:#3ecf8e;--accent:#3ea6ff}}
*{box-sizing:border-box}
body{margin:0;padding:40px 28px 72px;background:var(--bg);color:var(--fg);
font:14px/1.6 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:940px;margin:0 auto}
h1{font-size:24px;margin:0 0 4px}
h2{font-size:15px;margin:34px 0 10px;padding-bottom:6px;border-bottom:1px solid var(--line)}
.sub{color:var(--muted);margin:0 0 6px}
.note{background:var(--panel);border:1px solid var(--line);border-radius:10px;
padding:14px 16px;margin:18px 0;color:var(--muted);font-size:12.5}
table{width:100%;border-collapse:collapse;font-size:12.5}
th{text-align:left;color:var(--muted);font-weight:600;padding:7px 10px;border-bottom:1px solid var(--line)}
td{padding:7px 10px;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:0}
.none{color:var(--muted);font-size:12.5;margin:0 0 6px}
.stats{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0 0;padding:0;list-style:none}
.stats li{flex:1 1 150px;background:var(--panel);border:1px solid var(--line);
border-radius:10px;padding:11px 13px}
.stats b{display:block;font-size:19px;font-weight:600}
.stats span{color:var(--muted);font-size:11px}
.bad{color:var(--bad)}.warn{color:var(--warn)}.ok{color:var(--ok)}
footer{margin-top:44px;padding-top:14px;border-top:1px solid var(--line);
color:var(--muted);font-size:11.5}
@media print{body{padding:0}.note{break-inside:avoid}table{break-inside:auto}tr{break-inside:avoid}}
`;

/**
 * Builds the report.
 *
 * Takes the estate rather than the raw snapshot wherever it can, because the
 * estate is where measurement has already been separated from inference — so
 * the document inherits that distinction instead of re-deriving it.
 */
export function surveyReport(estate: Estate, snapshot: SurveySnapshot | null, t: Dict): string {
  const r = t.report;
  const when = (estate.surveyedAt ?? '').slice(0, 16).replace('T', ' ');
  const generated = new Date().toISOString().slice(0, 16).replace('T', ' ');

  const sections: string[] = [];

  sections.push(
    `<h1>${esc(r.title)}</h1>`,
    `<p class="sub">${esc(estate.source === 'survey' ? r.subtitle(when) : r.subtitleDemo)}</p>`,
  );

  if (estate.source !== 'survey') {
    sections.push(`<div class="note">${esc(r.demoWarning)}</div>`);
  }

  sections.push(
    '<ul class="stats">',
    ...estate.stats.map(
      (s) =>
        `<li><b>${esc(s.value)}${esc(s.suffix ?? '')}</b><span>${esc(s.label)}</span></li>`,
    ),
    '</ul>',
  );

  sections.push(
    table(
      r.findings,
      [r.colSeverity, r.colWhat, r.colWhere, r.colDetail],
      estate.risks.map((risk) => [t.labels.severity[risk.severity], risk.title, risk.where, risk.text]),
      r.noFindings,
    ),
  );

  sections.push(
    table(
      r.capacity,
      [r.colWhat, r.colValue, r.colUsed],
      estate.capacity.map((c) => [c.label, c.value, c.percent > 0 ? `${c.percent}%` : '—']),
    ),
  );
  if (estate.capacityNote) {
    sections.push(`<div class="note">${esc(estate.capacityNote)}</div>`);
  }

  const backups = estate.backups;
  sections.push(
    table(
      r.backups,
      [r.colJob, r.colTarget, r.colEvidence],
      backups.jobs.map((j) => [j.name, j.target, j.evidence]),
      // An empty list means one of two things, and the document has to say
      // which: nothing scheduled, or nothing the survey was allowed to read.
      backups.jobsReadable ? r.noBackups : r.backupsUnreadable,
    ),
    `<div class="note">${esc(
      r.backupSummary(backups.protectedCount, backups.guestCount, backups.unprotected.length),
    )}${backups.verifiable ? '' : ` ${esc(r.backupsUnverifiable)}`}</div>`,
  );

  sections.push(
    table(
      r.devices,
      [r.colName, r.colWhere, r.colState],
      estate.nodes.map((n) => [n.name, n.subtitle ?? '', t.labels.status[n.status] ?? n.status]),
    ),
  );

  sections.push(
    table(
      r.rules,
      [r.colSource, r.colTarget, r.colPort, r.colAction, r.colVerified],
      estate.rules.map((rule) => [
        rule.src,
        rule.dst,
        rule.port,
        rule.action,
        t.labels.provenance[rule.state] ?? rule.state,
      ]),
      r.noRules,
    ),
  );

  if (snapshot) {
    sections.push(
      table(
        r.sources,
        [r.colTime, r.colSource, r.colWhat],
        snapshot.log.map((l) => [l.time, l.source, l.message]),
      ),
    );
    if (snapshot.errors.length > 0) {
      sections.push(
        table(r.problems, [r.colWhat], snapshot.errors.map((e) => [e])),
      );
    }
  }

  sections.push(`<div class="note">${esc(t.survey.provenanceNote)}</div>`);

  return [
    '<!doctype html>',
    `<html lang="${esc(t.reportLang)}"><head><meta charset="utf-8">`,
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${esc(r.title)}${when ? ` · ${esc(when)}` : ''}</title>`,
    `<style>${STYLE}</style></head><body><main>`,
    sections.filter(Boolean).join('\n'),
    `<footer>${esc(r.footer(generated))}</footer>`,
    '</main></body></html>',
  ].join('\n');
}
