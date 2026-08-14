import { useMemo, useState } from 'react';
import type { PortAssignment, PortRole, ResolvedBlueprint } from '@/blueprint/model';
import { useI18n } from '@/i18n';
import { tint, type Palette } from '@/lib/palette';
import type { BlueprintApi } from '@/state/useBlueprints';
import type { EstateApi } from '@/state/useEstate';
import { Pill, SectionLabel } from '../ui';

/**
 * The port layout editor.
 *
 * The user says what a port is *for*; the VLANs follow. That is the whole
 * design — the tagged column is read-only on purpose, because a hand-typed
 * trunk list is exactly how one network goes missing and the symptom shows up
 * three rooms away.
 *
 * The import button is the shortcut worth having: after a survey, every port
 * that is actually plugged in arrives pre-filled with the neighbour LLDP saw,
 * and the work becomes correcting a list rather than writing one.
 */

const ROLES: PortRole[] = ['access', 'ap', 'server', 'trunk', 'uplink', 'off'];

const COLUMNS = '1fr 52px 1.4fr 1.2fr 1.1fr 1.5fr 44px';

export function PortsTab({
  api,
  estate,
  resolved,
  palette,
  accent,
}: {
  api: BlueprintApi;
  estate: EstateApi;
  resolved: ResolvedBlueprint;
  palette: Palette;
  accent: string;
}) {
  const { t } = useI18n();
  const x = t.ports;
  const [notice, setNotice] = useState<string | null>(null);

  const ports = api.current?.ports ?? [];
  const networks = resolved.networks;
  const derived = useMemo(
    () => new Map(resolved.ports.map((p) => [`${p.device}#${p.idx}`, p])),
    [resolved.ports],
  );

  /**
   * Seeds the layout from the survey.
   *
   * Only ports that are up are taken: a switch's unused ports are noise here,
   * and adding twenty empty rows would bury the six that matter. The role is a
   * guess from what LLDP saw, and it is meant to be corrected.
   */
  const importFromSurvey = () => {
    const devices = estate.snapshot?.unifi?.devices ?? [];
    const found: PortAssignment[] = [];
    for (const d of devices) {
      for (const p of d.ports) {
        if (!p.up) continue;
        const neighbour = p.neighbourName.toLowerCase();
        const role: PortRole = p.isUplink
          ? 'uplink'
          : /ap|u6|u7|uap/.test(neighbour)
            ? 'ap'
            : /usw|switch|flex/.test(neighbour)
              ? 'trunk'
              : /pve|proxmox|esxi|server/.test(neighbour)
                ? 'server'
                : 'access';
        found.push({
          id: `port-${d.mac}-${p.idx}`,
          device: d.name || d.model || d.mac,
          idx: p.idx,
          label: p.neighbourName || p.name,
          role,
          nativeVlan: 0,
          poe: p.poeEnabled,
        });
      }
    }
    if (found.length === 0) {
      setNotice(x.importNothing);
      return;
    }
    api.setPorts(found);
    setNotice(x.importedCount(found.length));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <SectionLabel>{x.portsTitle}</SectionLabel>
        <div
          className="pretty"
          style={{ fontSize: 11.5, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 12 }}
        >
          {x.subtitle}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <button type="button" className="btn-ghost" onClick={() => api.addPort()}>
            {x.addPort}
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={!estate.snapshot}
            onClick={importFromSurvey}
          >
            {x.importFromSurvey}
          </button>
          {notice ? (
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>{notice}</span>
          ) : null}
        </div>

        {ports.length === 0 ? (
          <div className="soft" style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>{x.empty}</div>
            <div className="pretty" style={{ fontSize: 11.5, color: 'var(--text2)', lineHeight: 1.6 }}>
              {x.emptyBody}
            </div>
          </div>
        ) : (
          <div className="panel" style={{ overflow: 'hidden' }}>
            <div
              className="col-head"
              style={{
                display: 'grid',
                gridTemplateColumns: COLUMNS,
                gap: 8,
                padding: '10px 14px',
                borderBottom: '1px solid var(--line)',
              }}
            >
              <div>{x.colDevice}</div>
              <div>{x.colPort}</div>
              <div>{x.colLabel}</div>
              <div>{x.colRole}</div>
              <div>{x.colNative}</div>
              <div>{x.colTagged}</div>
              <div />
            </div>

            {ports.map((p) => {
              const plan = derived.get(`${p.device}#${p.idx}`);
              const isAccess = p.role === 'access';
              return (
                <div
                  key={p.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: COLUMNS,
                    gap: 8,
                    padding: '8px 14px',
                    borderBottom: '1px solid var(--line)',
                    alignItems: 'center',
                  }}
                >
                  <input
                    className="input input--mono"
                    style={{ fontSize: 11 }}
                    value={p.device}
                    onChange={(e) => api.updatePort(p.id, { device: e.target.value })}
                  />
                  <input
                    className="input input--mono"
                    style={{ fontSize: 11 }}
                    inputMode="numeric"
                    value={p.idx}
                    onChange={(e) => api.updatePort(p.id, { idx: Number(e.target.value) || 0 })}
                  />
                  <input
                    className="input"
                    style={{ fontSize: 11 }}
                    value={p.label}
                    onChange={(e) => api.updatePort(p.id, { label: e.target.value })}
                  />
                  <select
                    className="input"
                    style={{ fontSize: 11 }}
                    value={p.role}
                    onChange={(e) => api.updatePort(p.id, { role: e.target.value as PortRole })}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {x.roles[r]}
                      </option>
                    ))}
                  </select>

                  {isAccess ? (
                    <select
                      className="input"
                      style={{ fontSize: 11 }}
                      value={p.nativeVlan}
                      onChange={(e) =>
                        api.updatePort(p.id, { nativeVlan: Number(e.target.value) || 0 })
                      }
                    >
                      <option value={0}>—</option>
                      {networks.map((n) => (
                        <option key={n.vlan} value={n.vlan}>
                          {n.vlan} · {n.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="mono" style={{ fontSize: 10.5, color: 'var(--text3)' }}>
                      {plan?.nativeVlan ? `${plan.nativeVlan} · MGMT` : '—'}
                    </span>
                  )}

                  {/* Read-only by design: this column is the answer, not a field. */}
                  <span
                    className="mono"
                    style={{ fontSize: 10, color: 'var(--text2)', lineHeight: 1.45 }}
                  >
                    {plan && plan.taggedVlans.length > 0 ? plan.taggedVlans.join(', ') : '—'}
                  </span>

                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ color: palette.bad, fontSize: 10.5, padding: '4px 7px' }}
                    onClick={() => api.removePort(p.id)}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {resolved.portProfiles.length > 0 ? (
        <div>
          <SectionLabel>{x.profilesTitle}</SectionLabel>
          <div
            className="pretty"
            style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.6, marginBottom: 10 }}
          >
            {x.writeNote}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {resolved.portProfiles.map((profile) => (
              <div
                key={profile.name}
                className="soft"
                style={{ padding: '11px 13px', borderColor: tint(accent, '44') }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                  <span className="mono" style={{ fontSize: 11.5, fontWeight: 600 }}>
                    {profile.name}
                  </span>
                  <Pill color={palette.idle} tight>
                    {x.usedBy(profile.portCount)}
                  </Pill>
                  {profile.poe ? (
                    <Pill color={palette.warn} tight>
                      {x.poe}
                    </Pill>
                  ) : null}
                </div>
                <div
                  className="pretty"
                  style={{ fontSize: 11, color: 'var(--text2)', marginTop: 5 }}
                >
                  {profile.purpose}
                </div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--text3)', marginTop: 5 }}>
                  {x.colNative}: {profile.nativeVlan || '—'} · {x.colTagged}:{' '}
                  {profile.taggedVlans.length > 0 ? profile.taggedVlans.join(', ') : '—'}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
