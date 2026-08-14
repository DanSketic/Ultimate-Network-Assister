import {
  SEVERITY_TONE,
  type FirewallRule,
  type MatrixCell,
  type SecuritySignal,
  type Zone,
} from '@/data/model';
import { MATRIX_TONE, provenanceTone } from '@/data/policy';
import { useT } from '@/i18n';
import type { Palette } from '@/lib/palette';
import { NoteRow, PanelTitle, Pill } from '../ui';

const RULE_COLUMNS = '1fr 1fr 1.1fr .8fr 1fr .7fr';

export interface PolicyViewProps {
  palette: Palette;
  zones: Zone[];
  matrix: MatrixCell[][];
  matrixNote: string;
  rules: FirewallRule[];
  signals: SecuritySignal[];
}

export function PolicyView({ palette, zones, matrix, matrixNote, rules, signals }: PolicyViewProps) {
  const t = useT();
  const cellLabel: Record<MatrixCell, string> = {
    a: t.policy.allow,
    b: t.policy.block,
    l: t.policy.limited,
    u: t.policy.unverified,
  };
  const ZONES = zones;
  const ZONE_MATRIX = matrix;
  const RULES = rules;
  const SIGNALS = signals;
  const unverified = rules.filter((r) => r.state !== 'Felmért').length;
  // The zone grid is square by construction, so one template drives both axes.
  const MATRIX_COLUMNS = `96px repeat(${Math.max(1, zones.length)},1fr)`;

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '18px 20px 26px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{t.policy.heading}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text2)' }}>
          {t.policy.summary(ZONES.length, RULES.length, unverified)}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.min(6, Math.max(1, ZONES.length))},1fr)`,
          gap: 10,
          marginBottom: 20,
        }}
      >
        {ZONES.map((zone) => {
          const color = zone.state === 'Felmért' ? palette.ok : palette.bad;
          return (
            <div
              key={zone.vlan}
              className="panel panel--r10"
              style={{ padding: '12px 13px 13px', position: 'relative', overflow: 'hidden' }}
            >
              <div
                style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: color }}
              />
              <div
                className="mono"
                style={{ fontSize: 9.5, color: 'var(--text3)', letterSpacing: '.04em' }}
              >
                VLAN {zone.vlan}
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, marginTop: 3 }}>{zone.name}</div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--text2)', marginTop: 7 }}>
                {zone.net}
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  marginTop: 9,
                  fontSize: 10.5,
                  color: 'var(--text2)',
                }}
              >
                <ZoneRow label={t.policy.ssid} value={zone.ssid} />
                <ZoneRow label={t.policy.devices} value={String(zone.devices)} />
                <ZoneRow label={t.inspector.isolation} value={zone.isolation} />
              </div>
              <Pill color={color} style={{ marginTop: 10 }}>
                {t.labels.provenance[zone.state]}
              </Pill>
            </div>
          );
        })}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(420px,0.9fr) 1.35fr',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <div className="panel" style={{ padding: '15px 16px 17px' }}>
          <PanelTitle title={t.policy.matrix} subtitle={matrixNote} style={{ marginBottom: 14 }} />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: MATRIX_COLUMNS,
              gap: 4,
              alignItems: 'center',
            }}
          >
            <div />
            {ZONES.map((z) => (
              <div
                key={z.vlan}
                style={{ fontSize: 9, color: 'var(--text3)', textAlign: 'center', lineHeight: 1.2 }}
              >
                {z.vlan}
              </div>
            ))}
          </div>

          {ZONE_MATRIX.map((row, rowIndex) => (
            <div
              key={ZONES[rowIndex]!.vlan}
              style={{
                display: 'grid',
                gridTemplateColumns: MATRIX_COLUMNS,
                gap: 4,
                alignItems: 'center',
                marginTop: 4,
              }}
            >
              <div className="ellipsis" style={{ fontSize: 10.5, color: 'var(--text2)' }}>
                {ZONES[rowIndex]!.name}
              </div>
              {row.map((cell, colIndex) => (
                <div
                  key={colIndex}
                  title={`${ZONES[rowIndex]!.name} → ${ZONES[colIndex]!.name}: ${cellLabel[cell]}`}
                  style={{
                    height: 26,
                    borderRadius: 5,
                    background: palette[MATRIX_TONE[cell]],
                    opacity: cell === 'a' ? 1 : 0.18,
                    border: cell === 'u' ? `1px dashed ${palette.idle}` : '1px solid transparent',
                  }}
                />
              ))}
            </div>
          ))}

          <div
            style={{
              display: 'flex',
              gap: 14,
              marginTop: 14,
              paddingTop: 13,
              borderTop: '1px solid var(--line)',
              flexWrap: 'wrap',
            }}
          >
            <MatrixKey color={palette.ok} label={t.policy.allow} />
            <MatrixKey color={palette.bad} label={t.policy.block} faded />
            <MatrixKey color={palette.warn} label={t.policy.limited} faded />
            <MatrixKey color={palette.idle} label={t.policy.unverified} dashed />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="panel" style={{ overflow: 'hidden' }}>
            <PanelTitle
              title={t.policy.rules}
              subtitle={t.policy.rulesNote}
              style={{ padding: '14px 16px 11px', borderBottom: '1px solid var(--line)' }}
            />
            <div
              className="col-head"
              style={{
                display: 'grid',
                gridTemplateColumns: RULE_COLUMNS,
                gap: 8,
                padding: '9px 16px',
                borderBottom: '1px solid var(--line)',
              }}
            >
              <div>{t.policy.colSource}</div>
              <div>{t.policy.colTarget}</div>
              <div>{t.policy.colPort}</div>
              <div>{t.policy.colAction}</div>
              <div>{t.policy.colEvidence}</div>
              <div>{t.policy.colChecked}</div>
            </div>
            {RULES.map((r, i) => (
              <div
                key={i}
                className="row-hover"
                style={{
                  display: 'grid',
                  gridTemplateColumns: RULE_COLUMNS,
                  gap: 8,
                  padding: '10px 16px',
                  borderBottom: '1px solid var(--line)',
                  fontSize: 11.5,
                  alignItems: 'center',
                }}
              >
                <div>{r.src}</div>
                <div style={{ color: 'var(--text2)' }}>{r.dst}</div>
                <div className="mono" style={{ fontSize: 10.5, color: 'var(--text2)' }}>
                  {r.port}
                </div>
                <div
                  style={{
                    color: r.action === 'Tilt' ? palette.bad : palette.ok,
                    fontWeight: 500,
                  }}
                >
                  {r.action === 'Tilt' ? t.policy.block : t.policy.allow}
                </div>
                <div>
                  <Pill color={palette[provenanceTone(r.state)]}>
                    {t.labels.provenance[r.state]}
                  </Pill>
                </div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--text3)' }}>
                  {r.checkedAt}
                </div>
              </div>
            ))}
          </div>

          <div className="panel" style={{ padding: '15px 16px 8px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 11 }}>{t.policy.signals}</div>
            {SIGNALS.map((s) => {
              const color = palette[SEVERITY_TONE[s.severity]];
              return (
                <NoteRow
                  key={s.title}
                  color={color}
                  style={{ padding: '11px 0', borderTop: '1px solid var(--line)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, fontWeight: 500 }}>{s.title}</span>
                    <Pill color={color} tight>
                      {t.labels.severity[s.severity]}
                    </Pill>
                    <span className="mono" style={{ fontSize: 9.5, color: 'var(--text3)' }}>
                      {s.zone}
                    </span>
                  </div>
                  <div
                    className="pretty"
                    style={{
                      fontSize: 11.5,
                      color: 'var(--text2)',
                      marginTop: 4,
                      lineHeight: 1.5,
                    }}
                  >
                    {s.text}
                  </div>
                </NoteRow>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function ZoneRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <span>{label}</span>
      <span className="ellipsis" style={{ color: 'var(--text)' }}>
        {value}
      </span>
    </div>
  );
}

function MatrixKey({
  color,
  label,
  faded,
  dashed,
}: {
  color: string;
  label: string;
  faded?: boolean;
  dashed?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div
        style={{
          width: 11,
          height: 11,
          borderRadius: 3,
          background: dashed ? 'transparent' : color,
          border: dashed ? `1px dashed ${color}` : undefined,
          opacity: faded ? 0.35 : 1,
        }}
      />
      <span style={{ fontSize: 10, color: 'var(--text2)' }}>{label}</span>
    </div>
  );
}
