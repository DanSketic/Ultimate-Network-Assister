import type { Dict, Lang } from '@/i18n';
import type { Plan, PlanStep, ResolvedBlueprint } from './model';

/**
 * Renders a resolved blueprint and its plan into a standalone handbook.
 *
 * The output is one self-contained HTML file with no external requests, so it
 * survives being emailed, printed or opened on a machine that has never seen
 * this application.
 */

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });

function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return '';
  return [
    '<table>',
    `<thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>`,
    '<tbody>',
    ...rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`),
    '</tbody></table>',
  ].join('\n');
}

function list(items: string[], cls = ''): string {
  if (items.length === 0) return '';
  return `<ul${cls ? ` class="${cls}"` : ''}>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
}

function stepBlock(step: PlanStep, index: number, t: Dict): string {
  const g = t.guide;
  const badges = [
    `<span class="badge badge--${step.capability}">${esc(t.blueprint.automation[step.capability])}</span>`,
    `<span class="badge badge--risk-${step.risk}">${esc(g.riskBadge(t.blueprint.risk[step.risk]))}</span>`,
    step.minutes > 0 ? `<span class="badge">${esc(g.minutes(step.minutes))}</span>` : '',
    step.requiresBackup ? `<span class="badge badge--warn">${esc(g.backupRequired)}</span>` : '',
    step.requiresLocalConsole ? `<span class="badge badge--warn">${esc(g.localConsole)}</span>` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const parts = [
    `<section class="step">`,
    `<h4><span class="step-n">${index}</span>${esc(step.title)}</h4>`,
    `<div class="badges">${badges}</div>`,
    `<p>${esc(step.detail)}</p>`,
  ];

  if (step.capabilityReason) {
    parts.push(`<p class="note">${esc(step.capabilityReason)}</p>`);
  }
  if (step.prechecks.length > 0) {
    parts.push(`<h5>${esc(g.prechecks)}</h5>`, list(step.prechecks, 'check'));
  }
  if (step.actions.length > 0) {
    parts.push(`<h5>${esc(g.todo)}</h5>`);
    for (const a of step.actions) {
      parts.push(
        `<div class="action${a.destructive ? ' action--destructive' : ''}">`,
        `<div class="action-head"><b>${esc(a.label)}</b><span>${esc(a.kind)} · ${esc(a.target)}</span></div>`,
        `<pre>${esc(a.body)}</pre>`,
        '</div>',
      );
    }
  }
  if (step.verification.length > 0) {
    parts.push(`<h5>${esc(g.verification)}</h5>`, list(step.verification, 'check'));
  }

  parts.push('</section>');
  return parts.join('\n');
}

export function exportGuideHtml(
  resolved: ResolvedBlueprint,
  plan: Plan,
  lang: Lang,
  t: Dict,
  generatedAt = new Date(),
): string {
  const g = t.guide;
  const bp = resolved.blueprint;
  const stamp = generatedAt.toISOString().slice(0, 16).replace('T', ' ');

  const summary = [
    `<div class="cards">`,
    card(g.cardModules, String(resolved.modules.length), g.cardModulesHint(plan.steps.length)),
    card(g.cardNetworks, String(resolved.networks.length), g.cardNetworksHint(bp.households.length)),
    card(g.cardRules, String(resolved.policies.length), g.cardRulesHint(resolved.zones.length)),
    card(
      g.cardGuests,
      String(resolved.guests.length),
      resolved.storage.length > 0 ? g.cardGuestsHint(resolved.storage.length) : '—',
    ),
    card(
      g.cardTime,
      g.cardTimeValue(Math.round(plan.totalMinutes / 60)),
      g.cardTimeHint(plan.counts.auto, plan.counts.assisted, plan.counts.manual),
    ),
    `</div>`,
  ].join('\n');

  const issues =
    resolved.issues.length > 0
      ? [
          '<section class="issues">',
          `<h2>${esc(g.issues)}</h2>`,
          '<ul>',
          ...resolved.issues.map(
            (i) => `<li class="issue issue--${i.severity}">${esc(i.message)}</li>`,
          ),
          '</ul>',
          '</section>',
        ].join('\n')
      : '';

  const target = [
    `<section><h2>${esc(g.targetState)}</h2>`,

    resolved.networks.length > 0
      ? `<h3>${esc(g.networks)}</h3>${table(
          g.networkCols,
          resolved.networks.map((n) => [
            `<code>${n.vlan}</code>`,
            esc(n.name),
            `<code>${esc(n.cidr)}</code>`,
            `<code>${esc(n.gateway)}</code>`,
            esc(n.purpose),
          ]),
        )}`
      : '',

    resolved.ssids.length > 0
      ? `<h3>${esc(g.wifi)}</h3>${resolved.ssids
          .map(
            (s) =>
              `<h4>${esc(s.name)} <small>${esc(s.security)} · ${esc(s.band)}</small></h4>` +
              `<p>${esc(s.purpose)}</p>` +
              table(
                g.ppskCols,
                s.ppsk.map((k) => [esc(k.label), `<code>${k.vlan}</code>`, esc(k.note ?? '—')]),
              ),
          )
          .join('\n')}`
      : '',

    resolved.zones.length > 0
      ? `<h3>${esc(g.zones)}</h3>${table(
          g.zoneCols,
          resolved.zones.map((z) => [
            `<code>${esc(z.name)}</code>`,
            z.vlans.length > 0 ? `<code>${z.vlans.join(', ')}</code>` : '—',
            esc(z.purpose),
          ]),
        )}`
      : '',

    resolved.addressObjects.length > 0
      ? `<h3>${esc(g.addressObjects)}</h3>${table(
          g.addressCols,
          resolved.addressObjects.map((a) => [
            `<code>${esc(a.name)}</code>`,
            `<code>${esc(a.address)}</code>`,
            esc(a.purpose),
          ]),
        )}`
      : '',

    resolved.portObjects.length > 0
      ? `<h3>${esc(g.portObjects)}</h3>${table(
          g.portCols,
          resolved.portObjects.map((p) => [
            `<code>${esc(p.name)}</code>`,
            p.protocol.toUpperCase(),
            `<code>${esc(p.ports)}</code>`,
            esc(p.purpose),
          ]),
        )}`
      : '',

    resolved.policies.length > 0
      ? `<h3>${esc(g.rules)}</h3><p class="note">${esc(g.rulesNote)}</p>${table(
          g.ruleCols,
          resolved.policies
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((p) => [
              `<code>${p.order}</code>`,
              esc(p.from),
              esc(p.to),
              p.ports ? `<code>${esc(p.ports)}</code>` : '—',
              `<b class="${p.action === 'allow' ? 'ok' : 'bad'}">${esc(p.action === 'allow' ? g.allow : g.block)}</b>`,
              p.log ? esc(g.yes) : '—',
              esc(p.purpose),
            ]),
        )}`
      : '',

    resolved.guests.length > 0
      ? `<h3>${esc(g.guests)}</h3>${table(
          g.guestCols,
          resolved.guests.map((g) => [
            `<code>${g.vmid}</code>`,
            esc(g.name),
            g.kind.toUpperCase(),
            `<code>${g.vlan}</code>`,
            g.ip ? `<code>${esc(g.ip)}</code>` : '—',
            esc(g.vcpu),
            esc(g.ram),
            esc(g.disk),
            esc(g.os),
          ]),
        )}`
      : '',

    resolved.storage.length > 0
      ? `<h3>${esc(g.storage)}</h3>${table(
          g.storageCols,
          resolved.storage.map((s) => [
            `<code>${esc(s.name)}</code>`,
            esc(s.kind),
            `<code>${esc(s.devices)}</code>`,
            esc(s.purpose) +
              (s.destructive ? ` <b class="bad">${esc(g.storageDestructive)}</b>` : ''),
          ]),
        )}`
      : '',

    resolved.ports.length > 0
      ? `<h3>${esc(t.ports.portsTitle)}</h3><p class="note">${esc(t.ports.writeNote)}</p>${table(
          [t.ports.colDevice, t.ports.colPort, t.ports.colLabel, t.ports.colRole, t.ports.colProfile, t.ports.colTagged],
          resolved.ports
            .slice()
            .sort((a, b) => a.device.localeCompare(b.device) || a.idx - b.idx)
            .map((p) => [
              esc(p.device),
              `<code>${p.idx}</code>`,
              esc(p.label || '—'),
              esc(t.ports.roles[p.role]),
              `<code>${esc(p.profile)}</code>`,
              p.taggedVlans.length > 0 ? `<code>${p.taggedVlans.join(', ')}</code>` : '—',
            ]),
        )}`
      : '',

    resolved.portProfiles.length > 0
      ? `<h3>${esc(t.ports.profilesTitle)}</h3>${table(
          [t.ports.colProfile, t.ports.colNative, t.ports.colTagged, g.storageCols[3] ?? ''],
          resolved.portProfiles.map((p) => [
            `<code>${esc(p.name)}</code>`,
            p.nativeVlan ? `<code>${p.nativeVlan}</code>` : '—',
            p.taggedVlans.length > 0 ? `<code>${p.taggedVlans.join(', ')}</code>` : '—',
            esc(p.purpose),
          ]),
        )}`
      : '',

    resolved.services.length > 0
      ? `<h3>${esc(g.services)}</h3>${table(
          g.serviceCols,
          resolved.services.map((s) => [
            esc(s.name),
            `<code>${esc(s.host)}</code>`,
            `<code>${esc(s.ports)}</code>`,
            esc(s.exposure),
            esc(s.purpose),
          ]),
        )}`
      : '',

    '</section>',
  ]
    .filter(Boolean)
    .join('\n');

  const modules = plan.modules
    .map((pm, mi) => {
      const m = pm.module;
      return [
        `<section class="module" id="module-${esc(m.id)}">`,
        `<div class="module-kicker">${esc(t.blueprint.groups[m.group])} · ${esc(g.minutes(pm.minutes))}</div>`,
        `<h2>${esc(m.code)}. ${esc(m.title)}</h2>`,
        `<p class="lead">${esc(m.summary)}</p>`,
        ...pm.steps.map((s, si) => stepBlock(s, mi + 1 === 0 ? si + 1 : si + 1, t)),
        '</section>',
      ].join('\n');
    })
    .join('\n');

  const toc = plan.modules
    .map((pm) => `<li><a href="#module-${esc(pm.module.id)}">${esc(pm.module.code)}. ${esc(pm.module.title)}</a></li>`)
    .join('');

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(g.titleSuffix(bp.name))}</title>
<style>${STYLE}</style>
</head>
<body>
<header class="hero">
  <div class="hero-tag">${esc(g.generated(stamp))}</div>
  <h1>${esc(bp.name)}</h1>
  <p>${esc(bp.description)}</p>
</header>

<main>
${summary}
${issues}

<section class="toc"><h2>${esc(g.toc)}</h2><ol>${toc}</ol></section>

${target}

<section><h2>${esc(g.executionPlan)}</h2>
<p class="note">${esc(g.executionNote)}</p>
</section>

${modules}

<footer>
  <p>${esc(g.footer(stamp))}</p>
  <p class="note">${esc(g.footerNote)}</p>
</footer>
</main>
</body>
</html>`;
}

function card(label: string, value: string, hint: string): string {
  return `<div class="card"><span>${esc(label)}</span><b>${esc(value)}</b><small>${esc(hint)}</small></div>`;
}

const STYLE = `
:root{color-scheme:light dark;--bg:#ffffff;--panel:#f6f8fb;--line:#e2e7ee;--text:#0f1720;--text2:#5a6675;--text3:#8a94a1;--accent:#0b74d8;--ok:#12925e;--bad:#cf3b2d;--warn:#b57708}
@media (prefers-color-scheme:dark){:root{--bg:#0a0d11;--panel:#121820;--line:#26303b;--text:#e7edf4;--text2:#94a1b0;--text3:#6b7686;--accent:#3ea6ff;--ok:#3ecf8e;--bad:#f0655a;--warn:#f2b544}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.6 "IBM Plex Sans",system-ui,-apple-system,Segoe UI,sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:1080px;margin:0 auto;padding:0 24px 80px}
.hero{max-width:1080px;margin:0 auto;padding:56px 24px 32px}
.hero-tag{display:inline-block;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);border:1px solid var(--accent);border-radius:999px;padding:3px 10px}
h1{font-size:34px;line-height:1.15;letter-spacing:-.02em;margin:16px 0 8px}
h2{font-size:22px;letter-spacing:-.01em;margin:40px 0 10px}
h3{font-size:16px;margin:28px 0 8px}
h4{font-size:15px;margin:22px 0 6px;display:flex;align-items:baseline;gap:10px}
h4 small{font-weight:400;color:var(--text3);font-size:12px}
h5{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--text3);margin:16px 0 6px}
p{margin:8px 0;text-wrap:pretty}
.lead{color:var(--text2)}
.note{color:var(--text3);font-size:13px}
code{font-family:"IBM Plex Mono",ui-monospace,Consolas,monospace;font-size:.9em}
a{color:var(--accent)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:24px 0}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:4px}
.card span{font-size:12px;color:var(--text2)}
.card b{font-size:26px;font-weight:300;letter-spacing:-.02em}
.card small{font-size:11px;color:var(--text3)}
table{width:100%;border-collapse:collapse;margin:10px 0 18px;font-size:13.5px;display:block;overflow-x:auto}
th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--text3);font-weight:500;padding:8px 10px;border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top}
tr:hover td{background:var(--panel)}
.ok{color:var(--ok)}
.bad{color:var(--bad)}
.toc ol{columns:2;gap:24px;padding-left:20px}
.toc li{margin:4px 0;break-inside:avoid}
.module{border-top:1px solid var(--line);padding-top:28px;margin-top:40px}
.module-kicker{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--text3)}
.step{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:14px 0}
.step-n{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:var(--accent);color:#fff;font-size:12px;flex:none}
.badges{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px}
.badge{font-size:11px;border:1px solid var(--line);border-radius:5px;padding:2px 7px;color:var(--text2)}
.badge--auto{color:var(--ok);border-color:var(--ok)}
.badge--assisted{color:var(--accent);border-color:var(--accent)}
.badge--manual{color:var(--text2)}
.badge--warn{color:var(--warn);border-color:var(--warn)}
.badge--risk-high{color:var(--bad);border-color:var(--bad)}
.badge--risk-medium{color:var(--warn);border-color:var(--warn)}
ul.check{list-style:none;padding-left:0}
ul.check li{position:relative;padding-left:22px;margin:5px 0}
ul.check li::before{content:"";position:absolute;left:0;top:7px;width:11px;height:11px;border:1px solid var(--text3);border-radius:3px}
.action{border:1px solid var(--line);border-radius:9px;overflow:hidden;margin:8px 0;background:var(--bg)}
.action--destructive{border-color:var(--bad)}
.action-head{display:flex;justify-content:space-between;gap:12px;padding:7px 11px;border-bottom:1px solid var(--line);font-size:12px}
.action-head span{color:var(--text3)}
pre{margin:0;padding:11px;font-family:"IBM Plex Mono",ui-monospace,Consolas,monospace;font-size:12.5px;line-height:1.6;white-space:pre-wrap;word-break:break-word}
.issues{border:1px solid var(--warn);border-radius:12px;padding:4px 20px 16px;margin:24px 0}
.issue--error{color:var(--bad)}
.issue--warning{color:var(--warn)}
footer{margin-top:56px;padding-top:20px;border-top:1px solid var(--line);color:var(--text3);font-size:13px}
@media print{.toc{display:none}.step{break-inside:avoid}body{font-size:11pt}}
`;
