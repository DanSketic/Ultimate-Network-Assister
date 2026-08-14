import type { CSSProperties, ReactNode } from 'react';
import { saveTextFile } from '@/blueprint/store';
import { SEVERITY_TONE, type Recommendation, type StepState } from '@/data/model';
import { useI18n, useT } from '@/i18n';
import { vars } from '@/lib/css';
import { tint, type Palette } from '@/lib/palette';
import type { CopyApi } from '@/state/useAppState';
import type { Estate } from '@/survey/mapping';
import { Dot } from '../ui';

/**
 * The change plans the survey justifies.
 *
 * Everything on screen comes from the estate, so a demo estate says so rather
 * than presenting sample findings as if they were about the user's systems.
 */
export function AdviceView({
  estate,
  palette,
  accent,
  selectedId,
  onSelect,
  copy,
}: {
  estate: Estate;
  palette: Palette;
  accent: string;
  selectedId: string;
  onSelect: (id: string) => void;
  copy: CopyApi;
}) {
  const { t } = useI18n();
  const recommendations = estate.recommendations;
  const rec = recommendations.find((r) => r.id === selectedId) ?? recommendations[0];

  if (!rec) {
    return (
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px 28px' }}>
        <div className="panel" style={{ padding: '18px 20px', maxWidth: 640 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 7 }}>{t.advice.empty}</div>
          <div className="pretty" style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
            {t.advice.emptyBody}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', minWidth: 0, minHeight: 0 }}>
      <div
        style={{
          width: 330,
          flex: 'none',
          borderRight: '1px solid var(--line)',
          background: 'var(--panel)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{t.advice.title}</div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 3 }}>
            {t.advice.subtitle(recommendations.length)}
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 10 }}>
          {recommendations.map((r) => {
            const active = r.id === selectedId;
            return (
              <button
                key={r.id}
                type="button"
                className="tile"
                aria-pressed={active}
                style={vars({
                  '--tile-bg': active ? tint(accent, '14') : 'transparent',
                  '--tile-bc': active ? tint(accent, '66') : 'var(--line)',
                })}
                onClick={() => onSelect(r.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Dot color={palette[SEVERITY_TONE[r.severity]]} size={6} />
                  <div style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.35 }}>{r.title}</div>
                </div>
                <div
                  className="mono"
                  style={{ fontSize: 9.5, color: 'var(--text3)', marginTop: 7, paddingLeft: 14 }}
                >
                  {r.where}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px 28px', minWidth: 0 }}>
        {estate.source === 'demo' ? (
          <div
            className="panel panel--r11"
            style={{
              padding: '11px 14px',
              marginBottom: 16,
              fontSize: 11.5,
              lineHeight: 1.55,
              color: 'var(--text2)',
              borderColor: tint(palette.warn, '66'),
            }}
          >
            {t.advice.demoNotice}
          </div>
        ) : null}
        <RecommendationDetail
          rec={rec}
          estate={estate}
          palette={palette}
          accent={accent}
          copy={copy}
          t={t}
        />
      </div>
    </div>
  );
}

/**
 * The plan as text, for the clipboard and for the exported file alike.
 *
 * One writer for both so what you paste into a ticket and what you save to
 * disk cannot say different things. It carries where the content came from,
 * because a checklist that outlives this window should not be mistaken for a
 * statement about an estate nobody surveyed.
 */
function planText(rec: Recommendation, estate: Estate, t: ReturnType<typeof useT>): string {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const lines = [
    `# ${t.advice.exportHeading}: ${rec.title}`,
    '',
    `${rec.where}`,
    estate.source === 'survey' && estate.surveyedAt
      ? t.advice.exportSource(estate.surveyedAt.slice(0, 10))
      : t.advice.exportDemoSource,
    t.advice.exportGenerated(stamp),
    '',
    `**${t.advice.impact}:** ${rec.impact}`,
    `**${t.advice.risk}:** ${t.labels.riskLevel[rec.risk]}`,
    `**${t.advice.duration}:** ${rec.duration}`,
    '',
    `## ${t.advice.why}`,
    rec.why,
    '',
    `## ${t.advice.plan}`,
    `_${t.advice.noAuto}_`,
    '',
  ];

  rec.steps.forEach((step, i) => {
    lines.push(
      `- [${step.state === 'kész' ? 'x' : ' '}] **${i + 1}. ${step.name}** — ${step.text}`,
      `      (${t.labels.stepState[step.state]})`,
    );
  });

  return lines.join('\n');
}

function RecommendationDetail({
  rec,
  estate,
  palette,
  accent,
  copy,
  t,
}: {
  rec: Recommendation;
  estate: Estate;
  palette: Palette;
  accent: string;
  copy: CopyApi;
  t: ReturnType<typeof useT>;
}) {
  const riskColor =
    rec.risk === 'Magas' ? palette.bad : rec.risk === 'Közepes' ? palette.warn : palette.ok;

  return (
    <>
      <div className="pretty" style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-.01em' }}>
        {rec.title}
      </div>
      <div className="mono" style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
        {rec.where}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <SummaryCard label={t.advice.impact} style={{ flex: 1 }}>
          {rec.impact}
        </SummaryCard>
        <SummaryCard label={t.advice.risk} style={{ width: 150 }} valueColor={riskColor}>
          {t.labels.riskLevel[rec.risk]}
        </SummaryCard>
        <SummaryCard label={t.advice.duration} style={{ width: 150 }}>
          {rec.duration}
        </SummaryCard>
      </div>

      <div className="panel" style={{ padding: '15px 16px', marginTop: 16 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 7 }}>{t.advice.why}</div>
        <div
          className="pretty"
          style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.65 }}
        >
          {rec.why}
        </div>
      </div>

      <div className="panel" style={{ padding: '15px 16px 18px', marginTop: 16 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: 14,
            gap: 12,
          }}
        >
          <div style={{ fontSize: 12.5, fontWeight: 600 }}>{t.advice.plan}</div>
          <div style={{ fontSize: 10.5, color: 'var(--text3)' }}>{t.advice.noAuto}</div>
        </div>

        {rec.steps.map((step, i) => (
          <StepRow
            key={step.name}
            index={i + 1}
            name={step.name}
            text={step.text}
            state={step.state}
            stateLabel={t.labels.stepState[step.state]}
            palette={palette}
            accent={accent}
          />
        ))}

        <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
          <button
            type="button"
            className="btn-primary btn-primary--lg"
            style={vars({ '--btn-bg': accent })}
            onClick={() => copy.copy(planText(rec, estate, t), `plan:${rec.id}`)}
          >
            {copy.label(`plan:${rec.id}`, t.advice.prepare)}
          </button>
          <button
            type="button"
            className="btn-ghost btn-ghost--lg"
            onClick={() => {
              void saveTextFile(`${t.advice.exportName}-${rec.id.replace(/[:\s]+/g, '-')}.md`,
                planText(rec, estate, t), [{ name: 'Markdown', extensions: ['md'] }]);
            }}
          >
            {t.advice.exportChecklist}
          </button>
        </div>
      </div>
    </>
  );
}

function SummaryCard({
  label,
  children,
  style,
  valueColor,
}: {
  label: string;
  children: ReactNode;
  style?: CSSProperties;
  valueColor?: string;
}) {
  return (
    <div className="panel panel--r10" style={{ padding: '12px 14px', ...style }}>
      <div style={{ fontSize: 10, color: 'var(--text3)' }}>{label}</div>
      <div style={{ fontSize: 12, marginTop: 5, lineHeight: 1.4, color: valueColor }}>{children}</div>
    </div>
  );
}

function StepRow({
  index,
  name,
  text,
  state,
  stateLabel,
  palette,
  accent,
}: {
  index: number;
  name: string;
  text: string;
  state: StepState;
  stateLabel: string;
  palette: Palette;
  accent: string;
}) {
  const color = state === 'kész' ? palette.ok : state === 'folyamatban' ? accent : palette.idle;
  const filled = state !== 'vár';

  return (
    <div style={{ display: 'flex', gap: 13, paddingBottom: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 'none' }}>
        <div
          className="mono"
          style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            border: `1.5px solid ${color}`,
            background: filled ? color : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 9.5,
            // Pending steps keep the number readable instead of painting it
            // panel-coloured on a transparent disc.
            color: filled ? 'var(--panel)' : 'var(--text3)',
          }}
        >
          {index}
        </div>
        <div style={{ flex: 1, width: 1, background: 'var(--line)', marginTop: 4 }} />
      </div>
      <div style={{ flex: 1, paddingTop: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 500 }}>{name}</span>
          <span
            style={{
              fontSize: 9.5,
              color,
              border: `1px solid ${color}`,
              borderRadius: 4,
              padding: '1px 6px',
            }}
          >
            {stateLabel}
          </span>
        </div>
        <div
          className="pretty"
          style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 5, lineHeight: 1.5 }}
        >
          {text}
        </div>
      </div>
    </div>
  );
}
