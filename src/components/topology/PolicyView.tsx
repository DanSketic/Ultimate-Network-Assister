import { useMemo, useState } from 'react';
import {
  SEVERITY_TONE,
  type FirewallRule,
  type MatrixCell,
  type SecuritySignal,
  type Zone,
} from '@/data/model';
import { MATRIX_TONE, provenanceTone } from '@/data/policy';
import { useT } from '@/i18n';
import { vars } from '@/lib/css';
import { tint, type Palette } from '@/lib/palette';
import { NoteRow, PanelTitle, Pill } from '../ui';

/*
 * No source column: the group heading is the source, and repeating it down
 * every row of the group spent one column of six saying nothing.
 */
const RULE_COLUMNS = '1.2fr 1.1fr .8fr 1fr .7fr';

export interface PolicyViewProps {
  palette: Palette;
  accent: string;
  zones: Zone[];
  matrix: MatrixCell[][];
  matrixNote: string;
  /** Whether the gateway's loaded ruleset was read; see `Estate.liveRead`. */
  liveRead: boolean;
  rules: FirewallRule[];
  signals: SecuritySignal[];
}

/**
 * Four things, one at a time.
 *
 * These used to sit in a single column, which was tolerable at a dozen rules
 * and unusable at a hundred and fifty: the security signals — the part worth
 * reading first — were a long scroll below a table nobody reads top to bottom.
 * Each is now its own panel, the counts are on the tabs so nothing is hidden by
 * being unselected, and only the chosen one scrolls.
 */
type PolicyTab = 'zones' | 'matrix' | 'rules' | 'signals';

export function PolicyView({
  palette,
  accent,
  zones,
  matrix,
  matrixNote,
  liveRead,
  rules,
  signals,
}: PolicyViewProps) {
  const t = useT();
  const [tab, setTab] = useState<PolicyTab>('zones');
  const [filter, setFilter] = useState('');

  /*
   * A search over what the row actually shows.
   *
   * With a hundred and fifty rules the question is never "what are they all"
   * but "what touches this zone", and the answer has to be one box away.
   */
  const shownRules = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return rules;
    return rules.filter((r) =>
      [r.src, r.dst, r.port, r.action].some((field) =>
        String(field).toLowerCase().includes(needle),
      ),
    );
  }, [rules, filter]);

  /*
   * The rules by the zone they start from.
   *
   * Not an invented arrangement: the gateway dispatches on exactly this, one
   * chain per source — `UBIOS_<FROM>_IN_USER` — before it ever reaches the
   * per-pair chains, so a group here is a chain there.
   *
   * By source rather than by pair, because the ask was a shorter page and the
   * two differ by an order of magnitude: a hundred and fifty rules span most
   * of the ordered pairs but only as many sources as there are zones. Nothing
   * is lost by it — the destination is a column on every row — and "what may
   * this network reach" is the question anyway. Finding one specific pair is
   * what the filter is for.
   *
   * Order of first appearance, and the survey already sorted by index, so the
   * groups come out in the order the controller lists them.
   */
  const groups = useMemo(() => {
    const by = new Map<string, FirewallRule[]>();
    for (const r of shownRules) {
      const list = by.get(r.src);
      if (list) list.push(r);
      else by.set(r.src, [r]);
    }
    return [...by].map(([key, list]) => ({
      key,
      rules: list,
      targets: new Set(list.map((r) => r.dst)).size,
      blocked: list.filter((r) => r.action === 'Tilt').length,
      verified: list.filter((r) => r.state === 'Felmért').length,
    }));
  }, [shownRules]);

  const [opened, setOpened] = useState<Set<string>>(new Set());
  /*
   * A filter is a question about specific rules, so its results are open. Left
   * collapsed, a search would answer with a list of headings and hide the very
   * rows it was asked to find.
   */
  const filtering = filter.trim() !== '';
  const isOpen = (key: string) => filtering || opened.has(key);
  const allOpen = groups.length > 0 && groups.every((g) => isOpen(g.key));

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
  const verified = rules.filter((r) => r.state === 'Felmért').length;
  // The zone grid is square by construction, so one template drives both axes.
  const MATRIX_COLUMNS = `96px repeat(${Math.max(1, zones.length)},1fr)`;

  const TABS: { id: PolicyTab; label: string; count?: number }[] = [
    { id: 'zones', label: t.policy.tabZones, count: ZONES.length },
    { id: 'matrix', label: t.policy.tabMatrix },
    { id: 'rules', label: t.policy.rules, count: RULES.length },
    { id: 'signals', label: t.policy.signals, count: SIGNALS.length },
  ];

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        padding: '18px 20px 20px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 12,
          marginBottom: 12,
          flex: 'none',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600 }}>{t.policy.heading}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text2)' }}>
          {liveRead
            ? t.policy.summary(ZONES.length, RULES.length, verified)
            : t.policy.summaryNoLive(ZONES.length, RULES.length)}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 6,
          marginBottom: 14,
          flex: 'none',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        {TABS.map((entry) => {
          const active = tab === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              // The same chip the inspector uses, so the two tab strips in this
              // view read as the same control rather than as two ideas.
              className="tab-chip"
              aria-pressed={active}
              style={vars(
                {
                  '--tab-bg': active ? tint(accent, '1c') : 'transparent',
                  '--tab-fg': active ? accent : 'var(--text2)',
                  '--tab-bc': active ? tint(accent, '55') : 'var(--line)',
                },
                { display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11.5 },
              )}
              onClick={() => setTab(entry.id)}
            >
              {entry.label}
              {entry.count !== undefined ? (
                <span
                  className="mono"
                  style={{
                    fontSize: 9.5,
                    lineHeight: 1,
                    padding: '2px 5px',
                    borderRadius: 5,
                    // Carried on the chip's own colour so the count reads as
                    // part of the tab rather than as something stuck to it.
                    background: active ? tint(accent, '22') : 'var(--panel2)',
                    color: active ? accent : 'var(--text3)',
                  }}
                >
                  {entry.count}
                </span>
              ) : null}
            </button>
          );
        })}

        {tab === 'rules' ? (
          <>
            <button
              type="button"
              className="btn-ghost"
              style={{ marginLeft: 'auto' }}
              // While filtering the groups are open regardless, so the only
              // useful action is to open them all for good and drop the filter.
              onClick={() =>
                setOpened(allOpen && !filtering ? new Set() : new Set(groups.map((g) => g.key)))
              }
            >
              {allOpen && !filtering ? t.policy.collapseAll : t.policy.expandAll}
            </button>
            <input
              className="input"
              value={filter}
              placeholder={t.policy.filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{ width: 'auto', flex: '0 1 240px', fontSize: 11.5 }}
            />
          </>
        ) : null}
      </div>

      {tab === 'zones' ? (
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fill,minmax(210px,1fr))`,
          gap: 10,
          alignContent: 'start',
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
      ) : null}

      {tab === 'matrix' ? (
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
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
      </div>
      ) : null}

      {tab === 'rules' ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div
            className="panel"
            style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}
          >
            <PanelTitle
              title={t.policy.rules}
              subtitle={t.policy.rulesNote}
              style={{ padding: '14px 16px 11px', borderBottom: '1px solid var(--line)', flex: 'none' }}
            />
            <div
              className="col-head"
              style={{
                display: 'grid',
                gridTemplateColumns: RULE_COLUMNS,
                gap: 8,
                padding: '9px 16px',
                borderBottom: '1px solid var(--line)',
                flex: 'none',
              }}
            >
              <div>{t.policy.colTarget}</div>
              <div>{t.policy.colPort}</div>
              <div>{t.policy.colAction}</div>
              <div>{t.policy.colEvidence}</div>
              <div>{t.policy.colChecked}</div>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            {groups.length === 0 ? (
              <div style={{ padding: '16px', fontSize: 11.5, color: 'var(--text3)' }}>
                {t.policy.noMatch}
              </div>
            ) : null}
            {groups.map((g) => {
              const open = isOpen(g.key);
              return (
                <div key={g.key}>
                  <button
                    type="button"
                    className="row-hover"
                    aria-expanded={open}
                    // The heading is spans, so without this the control reads
                    // as an unnamed button to anything not looking at pixels.
                    aria-label={`${g.key} — ${t.policy.groupSummary(g.rules.length, g.targets, g.blocked)}`}
                    onClick={() =>
                      setOpened((prev) => {
                        const next = new Set(prev);
                        // While filtering every group reads as open, so a click
                        // has to be able to shut one — hence the explicit add.
                        if (next.has(g.key)) next.delete(g.key);
                        else next.add(g.key);
                        return next;
                      })
                    }
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 16px',
                      border: 'none',
                      borderBottom: '1px solid var(--line)',
                      background: open ? 'var(--panel2)' : 'transparent',
                      color: 'inherit',
                      font: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    <span
                      className="mono"
                      style={{ fontSize: 9, color: 'var(--text3)', flex: 'none', width: 8 }}
                    >
                      {open ? '▾' : '▸'}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 500, flex: 1, minWidth: 0 }}>
                      {g.key}
                    </span>
                    {g.verified > 0 ? (
                      <Pill color={palette.ok} tight>
                        {t.policy.groupVerified(g.verified)}
                      </Pill>
                    ) : null}
                    <span
                      className="mono"
                      style={{ fontSize: 10, color: 'var(--text3)', flex: 'none' }}
                    >
                      {t.policy.groupSummary(g.rules.length, g.targets, g.blocked)}
                    </span>
                  </button>

                  {open
                    ? g.rules.map((r, i) => (
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
                          <div>{r.dst}</div>
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
                      ))
                    : null}
                </div>
              );
            })}
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'signals' ? (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <div className="panel" style={{ padding: '15px 16px 8px', maxWidth: 860 }}>
            {SIGNALS.length === 0 ? (
              <div style={{ padding: '6px 0 14px', fontSize: 11.5, color: 'var(--text3)' }}>
                {t.policy.noSignals}
              </div>
            ) : null}
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
      ) : null}
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
