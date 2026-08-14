import { useMemo, useState } from 'react';
import { INSPECTOR_TABS, type InspectorTab } from '@/config';
import { configByKind, kbByKind } from '@/data/knowledge';
import {
  LINK_KINDS,
  linkProvenance,
  NODE_KINDS,
  SEVERITY_TONE,
  type FirewallRule,
  type NetLink,
  type NetNode,
  type Zone,
} from '@/data/model';
import { provenanceTone } from '@/data/policy';
import { ZONE_NAME_BY_KEY } from '@/data/topology';
import { useI18n } from '@/i18n';
import { vars } from '@/lib/css';
import { tint, type Palette } from '@/lib/palette';
import type { CopyApi } from '@/state/useAppState';
import { CommandCard, Dot, LabeledMeter, loadTone, Pill, SectionLabel } from '../ui';
import { PortList, PortStrip } from './PortStrip';
import { DeviceIcon, glyphFor } from '../DeviceIcon';

export interface InspectorProps {
  node: NetNode;
  nodes: NetNode[];
  links: NetLink[];
  zones: Zone[];
  rules: FirewallRule[];
  tab: InspectorTab;
  palette: Palette;
  accent: string;
  copy: CopyApi;
  onTab: (tab: InspectorTab) => void;
  onSelectNode: (id: string) => void;
}

export function Inspector({
  node,
  nodes,
  links,
  zones,
  rules: allRules,
  tab,
  palette,
  accent,
  copy,
  onTab,
  onSelectNode,
}: InspectorProps) {
  const { lang, t } = useI18n();
  const kind = NODE_KINDS[node.kind];
  // Which port the strip has picked out. Stamped with the node it belongs to,
  // so selecting a different device drops the highlight instead of pointing at
  // a port number that means something else there.
  const [picked, setPicked] = useState<{ node: string; idx: number } | null>(null);
  const port = picked?.node === node.id ? picked.idx : null;
  const setPort = (idx: number | null) =>
    setPicked(idx === null ? null : { node: node.id, idx });

  const connections = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    return links
      .filter((l) => l.from === node.id || l.to === node.id)
      .flatMap((link) => {
        const other = byId.get(link.from === node.id ? link.to : link.from);
        if (!other) return [];
        const meta = LINK_KINDS[link.kind];
        const outbound =
          (link.direction === 'ab' && link.from === node.id) ||
          (link.direction === 'ba' && link.to === node.id);

        const directionLabel =
          link.direction === 'both'
            ? t.inspector.bothWays
            : link.direction === 'none'
              ? t.inspector.closed
              : outbound
                ? t.inspector.outboundOnly
                : t.inspector.inboundOnly;

        return {
          id: other.id,
          name: other.name,
          meta: `${t.labels.nodeKind[other.kind]} · ${other.subtitle}`,
          kindLabel: t.labels.linkKind[link.kind],
          provenance: t.labels.provenance[linkProvenance(link)],
          directionLabel,
          directionColor:
            link.direction === 'both'
              ? palette.ok
              : link.direction === 'none'
                ? palette.bad
                : palette.idle,
          toneColor: meta.tone === 'accent' ? accent : palette[meta.tone],
          statusColor: palette[other.status],
        };
      });
  }, [node.id, nodes, links, palette, accent, t]);

  const rules = useMemo(
    () => allRules.filter((r) => r.src === node.zone || r.dst === node.zone),
    [allRules, node.zone],
  );

  const zone = useMemo(() => {
    const name = ZONE_NAME_BY_KEY[node.zone];
    return name ? (zones.find((z) => z.name === name) ?? null) : null;
  }, [zones, node.zone]);

  const guides = kbByKind(lang)[node.kind];
  const config = configByKind(lang)[node.kind];

  return (
    <aside
      style={{
        width: 398,
        flex: 'none',
        background: 'var(--panel)',
        borderLeft: '1px solid var(--line)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
          <div
            className="mono"
            style={{
              width: 34,
              height: 34,
              flex: 'none',
              borderRadius: 8,
              border: '1px solid var(--line)',
              background: 'var(--panel2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 1,
              fontSize: 8,
              color: 'var(--accent)',
            }}
          >
            <DeviceIcon glyph={glyphFor(node.kind, node.subtitle, node.name)} size={16} />
            {kind.code}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-.01em' }}>{node.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
              {t.labels.nodeKind[node.kind]} ·{' '}
              <span className="mono" style={{ fontSize: 10.5 }}>
                {node.subtitle}
              </span>
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 9px',
              borderRadius: 6,
              background: 'var(--panel2)',
              border: '1px solid var(--line)',
            }}
          >
            <Dot color={palette[node.status]} size={6} />
            <span style={{ fontSize: 10.5, color: 'var(--text2)' }}>
              {t.labels.status[node.status]}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 13 }}>
          {INSPECTOR_TABS.map((id) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                className="tab-chip"
                aria-pressed={active}
                style={vars({
                  '--tab-bg': active ? tint(accent, '1c') : 'transparent',
                  '--tab-fg': active ? accent : 'var(--text2)',
                  '--tab-bc': active ? tint(accent, '55') : 'var(--line)',
                })}
                onClick={() => onTab(id)}
              >
                {t.inspector.tabs[id]}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 18px 22px' }}>
        {tab === 'overview' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <SectionLabel style={{ marginBottom: 9 }}>{t.inspector.facts}</SectionLabel>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 1,
                  background: 'var(--line)',
                  border: '1px solid var(--line)',
                  borderRadius: 9,
                  overflow: 'hidden',
                }}
              >
                {node.facts.map((fact) => (
                  <div key={fact.key} style={{ background: 'var(--panel)', padding: '10px 11px' }}>
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>{fact.key}</div>
                    <div style={{ fontSize: 11.5, marginTop: 3, lineHeight: 1.35 }}>{fact.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <SectionLabel style={{ marginBottom: 11 }}>{t.inspector.load}</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {node.metrics.map((m) => (
                  <LabeledMeter
                    key={m.label}
                    label={m.label}
                    value={m.value}
                    percent={m.percent}
                    color={loadTone(m.percent, palette, accent)}
                  />
                ))}
              </div>
            </div>

            {node.warnings.length > 0 ? (
              <div>
                <SectionLabel style={{ marginBottom: 9 }}>{t.inspector.warnings}</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {node.warnings.map((w, i) => {
                    const color = palette[SEVERITY_TONE[w.severity]];
                    return (
                      <div
                        key={i}
                        className="soft"
                        style={{ display: 'flex', gap: 10, padding: '11px 12px' }}
                      >
                        <div
                          style={{ width: 3, flex: 'none', borderRadius: 2, background: color }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 9.5, color, letterSpacing: '.04em' }}>
                            {t.labels.severity[w.severity]}
                          </div>
                          <div
                            className="pretty"
                            style={{
                              fontSize: 11.5,
                              lineHeight: 1.5,
                              marginTop: 3,
                              color: 'var(--text2)',
                            }}
                          >
                            {w.text}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === 'services' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {node.services.map((svc) => {
              const provColor = svc.provenance === 'Felmért' ? palette.ok : palette.warn;
              return (
                <div
                  key={svc.name}
                  className="soft soft--link"
                  style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 12px' }}
                >
                  <Dot color={palette[svc.status]} size={7} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{svc.name}</div>
                    <div
                      className="mono"
                      style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3 }}
                    >
                      {svc.detail}
                    </div>
                  </div>
                  <Pill color={provColor}>{t.labels.provenance[svc.provenance]}</Pill>
                </div>
              );
            })}
            {node.services.length === 0 ? (
              <div
                style={{
                  padding: '26px 16px',
                  border: '1px dashed var(--line2)',
                  borderRadius: 10,
                  textAlign: 'center',
                  color: 'var(--text3)',
                  fontSize: 11.5,
                  lineHeight: 1.6,
                }}
              >
                {t.inspector.noServices}
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === 'conns' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {node.ports && node.ports.length > 0 ? (
              <div style={{ marginBottom: 6 }}>
                <PortStrip
                  ports={node.ports}
                  palette={palette}
                  accent={accent}
                  selected={port}
                  onSelect={setPort}
                />
                <PortList ports={node.ports} palette={palette} selected={port} />
              </div>
            ) : null}
            {connections.map((c, i) => (
              <button
                key={`${c.id}-${i}`}
                type="button"
                className="soft soft--link"
                style={{
                  padding: '11px 12px',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                  color: 'inherit',
                }}
                onClick={() => onSelectNode(c.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <Dot color={c.statusColor} size={7} />
                  <div style={{ flex: 1, fontSize: 12, fontWeight: 500 }}>{c.name}</div>
                  <Pill color={c.directionColor}>{c.directionLabel}</Pill>
                  <Pill color={c.toneColor}>{c.provenance}</Pill>
                  {/* kindLabel already comes from the dictionary */}
                </div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>
                  {c.meta}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 5 }}>{c.kindLabel}</div>
              </button>
            ))}
            <div
              className="pretty"
              style={{ marginTop: 6, fontSize: 10.5, color: 'var(--text3)', lineHeight: 1.6 }}
            >
              {t.inspector.connectionsNote}
            </div>
          </div>
        ) : null}

        {tab === 'fw' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="soft panel--r10" style={{ padding: '13px 14px' }}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}
              >
                <div style={{ fontSize: 12.5, fontWeight: 500 }}>
                  {zone ? `VLAN ${zone.vlan} · ${zone.name}` : t.inspector.wanZone}
                </div>
                <Pill color={zone && zone.state !== 'Felmért' ? palette.bad : palette.ok}>
                  {t.labels.provenance[zone ? zone.state : 'Felmért']}
                </Pill>
              </div>
              <div style={{ display: 'flex', gap: 18, marginTop: 10 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>{t.inspector.range}</div>
                  <div className="mono" style={{ fontSize: 11, marginTop: 3 }}>
                    {zone ? zone.net : t.inspector.publicUplink}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>{t.inspector.isolation}</div>
                  <div style={{ fontSize: 11, marginTop: 3 }}>
                    {zone ? zone.isolation : t.inspector.outbound}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <SectionLabel style={{ marginBottom: 9 }}>{t.inspector.affectedRules}</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {rules.map((r, i) => (
                  <div key={i} className="soft" style={{ padding: '10px 12px' }}>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}
                    >
                      <span>{r.src}</span>
                      <span style={{ color: 'var(--text3)' }}>→</span>
                      <span style={{ color: 'var(--text2)' }}>{r.dst}</span>
                      <span style={{ flex: 1 }} />
                      <span
                        style={{
                          color: r.action === 'Tilt' ? palette.bad : palette.ok,
                          fontWeight: 500,
                        }}
                      >
                        {r.action === 'Tilt' ? t.policy.block : t.policy.allow}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 7 }}>
                      <span className="mono" style={{ fontSize: 10, color: 'var(--text3)' }}>
                        {r.port}
                      </span>
                      <Pill color={palette[provenanceTone(r.state)]} tight>
                        {t.labels.provenance[r.state]}
                      </Pill>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'kb' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div
              className="pretty"
              style={{ fontSize: 10.5, color: 'var(--text3)', lineHeight: 1.6, marginBottom: 3 }}
            >
              {t.inspector.kbNote}
            </div>
            {guides.map((g) => (
              <div key={g.title} className="soft soft--link" style={{ padding: '12px 13px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      fontSize: 9,
                      color: 'var(--accent)',
                      border: '1px solid var(--accent)',
                      borderRadius: 4,
                      padding: '1px 5px',
                    }}
                  >
                    {g.tag}
                  </div>
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 500, marginTop: 8, lineHeight: 1.35 }}>
                  {g.title}
                </div>
                <div
                  className="pretty"
                  style={{ fontSize: 11, color: 'var(--text2)', marginTop: 5, lineHeight: 1.5 }}
                >
                  {g.subtitle}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {tab === 'cfg' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div
              className="soft panel--r10"
              style={{ display: 'flex', gap: 10, padding: '12px 13px' }}
            >
              <div
                style={{ width: 3, flex: 'none', borderRadius: 2, background: palette.warn }}
              />
              <div
                className="pretty"
                style={{ fontSize: 11.5, lineHeight: 1.55, color: 'var(--text2)' }}
              >
                {config.note}
              </div>
            </div>

            <div>
              <SectionLabel style={{ marginBottom: 11 }}>{t.inspector.safeOrder}</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {config.steps.map((step, i) => (
                  <div key={step} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div
                      className="mono"
                      style={{
                        width: 19,
                        height: 19,
                        flex: 'none',
                        borderRadius: '50%',
                        border: '1px solid var(--line2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 9.5,
                        color: 'var(--text2)',
                      }}
                    >
                      {i + 1}
                    </div>
                    <div
                      className="pretty"
                      style={{ fontSize: 11.5, lineHeight: 1.5, paddingTop: 2 }}
                    >
                      {step}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <SectionLabel style={{ marginBottom: 9 }}>
                {t.inspector.referenceCommands}
              </SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {config.commands.map((c, i) => {
                  const key = `cfg-${node.id}-${i}`;
                  return (
                    <CommandCard
                      key={c.label}
                      label={c.label}
                      command={c.command}
                      copyLabel={copy.label(key)}
                      onCopy={() => copy.copy(c.command, key)}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
