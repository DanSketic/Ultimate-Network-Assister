import { SEVERITY_TONE } from '@/data/model';
import { useT } from '@/i18n';
import type { Palette } from '@/lib/palette';
import type { Estate } from '@/survey/mapping';
import { Dot, LabeledMeter, NoteRow, StatCard, ViewHeading } from '../ui';

export function OverviewView({
  estate,
  palette,
  accent,
  onOpenAdvice,
}: {
  estate: Estate;
  palette: Palette;
  accent: string;
  onOpenAdvice: () => void;
}) {
  const t = useT();
  const live = estate.source === 'survey';

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px 28px' }}>
      <ViewHeading
        title={t.overview.title}
        subtitle={
          live
            ? t.overview.subtitleLive(
                estate.surveyedAt?.slice(0, 16).replace('T', ' ') ?? t.common.none,
              )
            : t.overview.subtitleDemo
        }
        right={
          <div className="mono" style={{ fontSize: 10.5, color: 'var(--text3)' }}>
            {t.overview.profileCount(estate.profiles.length)}
          </div>
        }
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.max(1, estate.stats.length)},1fr)`,
          gap: 12,
          marginBottom: 18,
        }}
      >
        {estate.stats.map((s) => (
          <StatCard
            key={s.label}
            label={s.label}
            value={s.value}
            suffix={s.suffix}
            hint={s.hint}
            valueColor={s.tone ? palette[s.tone] : undefined}
          />
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.5fr 1fr',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <div className="panel" style={{ padding: '15px 16px 8px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              marginBottom: 6,
              gap: 12,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600 }}>{t.overview.risks}</div>
            <button type="button" className="link" onClick={onOpenAdvice}>
              {t.overview.openAdvice}
            </button>
          </div>
          {estate.risks.length === 0 ? (
            <div
              className="pretty"
              style={{
                padding: '18px 0 20px',
                fontSize: 11.5,
                color: 'var(--text3)',
                lineHeight: 1.6,
                borderTop: '1px solid var(--line)',
              }}
            >
              {t.overview.noRisks}
            </div>
          ) : null}
          {estate.risks.map((risk, i) => (
            <NoteRow
              key={`${risk.title}-${i}`}
              color={palette[SEVERITY_TONE[risk.severity]]}
              style={{ padding: '12px 0', borderTop: '1px solid var(--line)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12.5, fontWeight: 500 }}>{risk.title}</span>
                <span className="mono" style={{ fontSize: 9.5, color: 'var(--text3)' }}>
                  {risk.where}
                </span>
              </div>
              <div
                className="pretty"
                style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 4, lineHeight: 1.5 }}
              >
                {risk.text}
              </div>
            </NoteRow>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="panel" style={{ padding: '15px 16px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
              {t.overview.capacity}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {estate.capacity.map((c) => (
                <LabeledMeter
                  key={c.label}
                  label={c.label}
                  value={c.value}
                  percent={c.percent}
                  color={c.tone === 'accent' ? accent : palette[c.tone]}
                />
              ))}
            </div>
            {/*
              * An empty panel reads as a fault in the application. When the
              * survey could not obtain figures it says so, and says what the
              * usual cause is — the same courtesy the risks panel already
              * extends when it finds nothing.
              */}
            {estate.capacityNote || estate.capacity.length === 0 ? (
              <div
                className="pretty"
                style={{
                  fontSize: 11,
                  color: 'var(--text3)',
                  lineHeight: 1.6,
                  marginTop: estate.capacity.length > 0 ? 12 : 0,
                  paddingTop: estate.capacity.length > 0 ? 12 : 0,
                  ...(estate.capacity.length > 0
                    ? { borderTop: '1px solid var(--line)' }
                    : {}),
                }}
              >
                {estate.capacityNote ?? t.overview.noCapacity}
              </div>
            ) : null}
          </div>

          <div className="panel" style={{ padding: '15px 16px 6px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              {t.overview.sources}
            </div>
            {estate.profiles.map((p) => (
              <div
                key={p.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '11px 0',
                  borderTop: '1px solid var(--line)',
                }}
              >
                <Dot color={palette[p.status]} size={7} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 500 }}>{p.name}</div>
                  <div
                    className="mono ellipsis"
                    style={{ fontSize: 9.5, color: 'var(--text3)', marginTop: 3 }}
                  >
                    {p.url}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: 'var(--text2)' }}>{p.mode}</div>
                  <div className="mono" style={{ fontSize: 9.5, color: 'var(--text3)', marginTop: 3 }}>
                    {p.lastRun}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
