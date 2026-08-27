import { useMemo, useState } from 'react';
import { importPortsFromSurvey } from '@/blueprint/importPorts';
import type {
  ExtraNetwork,
  PortAssignment,
  PortRole,
  ResolvedBlueprint,
} from '@/blueprint/model';
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
 * with anything measured on it arrives pre-filled — the machine on it, the
 * network the controller already has untagged there, whether PoE is on — and
 * the work becomes correcting a list rather than writing one.
 */

const ROLES: PortRole[] = ['access', 'ap', 'server', 'trunk', 'uplink', 'off', 'unused'];

/*
 * One block per device, so the device is named once.
 *
 * The layout used to be a single table with the device typed into every row,
 * which put the switch's name twenty-four times on the screen and still left
 * the reader counting rows to see where one switch ended and the next began.
 * A port number only means anything next to the device it is on, so the device
 * is the group and the port number is the row.
 */
const COLUMNS = '52px 1.4fr 1.2fr 1.1fr 1.5fr 44px';

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
  /*
   * Networks the last import measured and the target state has no counterpart
   * for, kept so that the answer — adding them — is one click from where the
   * gap was found rather than a trip to another tab with three names to
   * remember.
   */
  const [missing, setMissing] = useState<ExtraNetwork[]>([]);

  const ports = api.current?.ports ?? [];
  const networks = resolved.networks;
  const derived = useMemo(
    () => new Map(resolved.ports.map((p) => [`${p.device}#${p.idx}`, p])),
    [resolved.ports],
  );

  /**
   * Seeds the layout from the survey.
   *
   * Everything the controller measured about a port is read, not only the port
   * table: LLDP, the uplink reports, the wired clients it learned, the port
   * profile on the port and the VLAN that profile makes untagged. What is
   * already in the layout is kept — only blanks are filled — so a second survey
   * costs nothing that was corrected by hand after the first.
   */
  const importFromSurvey = () => {
    const result = importPortsFromSurvey(estate.snapshot, ports, networks);
    setMissing(result.unmatched);
    if (result.added === 0 && result.enriched === 0) {
      setNotice(result.kept > 0 ? x.importOnlyEmpty(result.kept) : x.importNothing);
      return;
    }
    api.setPorts(result.ports);
    // What could not be placed is said in the same breath as what could:
    // a native network left empty is only actionable if the reader knows
    // which network the port was measured on.
    setNotice(
      [
        x.importSummary(result.added, result.enriched, result.unused),
        result.unmatched.length > 0
          ? x.importUnmatched(result.unmatched.map((n) => `${n.vlan} · ${n.name}`))
          : '',
      ]
        .filter(Boolean)
        .join(' · '),
    );
  };

  /*
   * The devices, in the order they first appear.
   *
   * Not sorted: the import already arrives device by device, and a group that
   * jumps somewhere else the moment its name is edited is a group nobody can
   * rename.
   */
  const groups = useMemo(() => {
    const out = new Map<string, PortAssignment[]>();
    for (const p of ports) {
      const rows = out.get(p.device);
      if (rows) rows.push(p);
      else out.set(p.device, [p]);
    }
    return [...out.entries()].map(([device, rows]) => ({ device, rows }));
  }, [ports]);

  /** Renaming the group renames every port on it — that is what a group is. */
  const renameDevice = (from: string, to: string) => {
    api.setPorts(ports.map((p) => (p.device === from ? { ...p, device: to } : p)));
  };

  /** A new row on this device, numbered after the highest port it already has. */
  const addPortTo = (device: string) => {
    const used = ports.filter((p) => p.device === device).map((p) => p.idx);
    api.setPorts([
      ...ports,
      {
        id: `port-${Date.now().toString(36)}-${ports.length}`,
        device,
        idx: Math.max(0, ...used) + 1,
        label: '',
        role: 'access',
        nativeVlan: 0,
        poe: false,
      },
    ]);
  };

  /*
   * Removing a whole device takes two clicks.
   *
   * A single row is one keystroke to put back; a switch is twenty-four, and
   * the ✕ for the two sits in the same picture. So the first click arms and
   * says so, and only the second one removes.
   */
  const [arming, setArming] = useState<string | null>(null);
  const removeDevice = (device: string) => {
    if (arming !== device) {
      setArming(device);
      return;
    }
    setArming(null);
    api.setPorts(ports.filter((p) => p.device !== device));
  };

  return (
    <div className="ports-layout">
      <div>
        <SectionLabel>{x.portsTitle}</SectionLabel>
        <div
          className="pretty"
          style={{ fontSize: 11.5, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 12 }}
        >
          {x.subtitle}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-ghost"
            title={x.addPortHint}
            onClick={() => api.addPort()}
          >
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

        {/*
          * The gap the import found, with the fix next to it.
          *
          * Everything needed is already measured — the VLAN, the range, the
          * gateway the estate answers on — so adding them is a button rather
          * than six fields typed from a message. What nobody measured is what
          * the networks are *for*, which is why the note says where to correct
          * that.
          */}
        {missing.length > 0 ? (
          <div className="soft" style={{ padding: '11px 13px', marginBottom: 12 }}>
            <div className="pretty" style={{ fontSize: 11.5, color: 'var(--text2)', lineHeight: 1.6 }}>
              {x.missingNetworks}
            </div>
            <div className="mono" style={{ fontSize: 10.5, color: 'var(--text3)', margin: '6px 0 9px' }}>
              {missing.map((n) => `${n.vlan} · ${n.name}${n.cidr ? ` · ${n.cidr}` : ''}`).join('   ')}
            </div>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                api.addNetworks(missing);
                setMissing([]);
                setNotice(x.missingNetworksAdded(missing.length));
              }}
            >
              {x.addMissingNetworks(missing.length)}
            </button>
          </div>
        ) : null}

        {ports.length === 0 ? (
          <div className="soft" style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>{x.empty}</div>
            <div className="pretty" style={{ fontSize: 11.5, color: 'var(--text2)', lineHeight: 1.6 }}>
              {x.emptyBody}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {groups.map((group) => {
              const free = group.rows.filter((p) => p.role === 'unused').length;
              return (
                <div
                  key={group.rows[0]!.id}
                  className="panel"
                  style={{ overflow: 'hidden' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 9,
                      flexWrap: 'wrap',
                      padding: '10px 14px',
                      borderBottom: '1px solid var(--line)',
                    }}
                  >
                    <input
                      className="input input--mono"
                      style={{ fontSize: 11.5, fontWeight: 600, maxWidth: 240 }}
                      value={group.device}
                      placeholder={x.deviceUnnamed}
                      aria-label={x.deviceName}
                      onChange={(e) => renameDevice(group.device, e.target.value)}
                    />
                    <Pill color={palette.idle} tight>
                      {x.devicePorts(group.rows.length)}
                    </Pill>
                    {/* Free ports are worth a number of their own: it is the
                        difference between a full switch and an empty one, and
                        the rows themselves all look alike. */}
                    {free > 0 ? (
                      <Pill color={palette.idle} tight>
                        {x.deviceUnusedCount(free)}
                      </Pill>
                    ) : null}
                    <span style={{ flex: 1 }} />
                    <button
                      type="button"
                      className="btn-ghost"
                      style={{ fontSize: 10.5, padding: '4px 8px' }}
                      title={x.addPortToHint(group.device || x.deviceUnnamed)}
                      onClick={() => addPortTo(group.device)}
                    >
                      {x.addPortTo}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      style={{
                        color: palette.bad,
                        fontSize: 10.5,
                        padding: '4px 8px',
                        fontWeight: arming === group.device ? 700 : 400,
                      }}
                      title={x.removeDevice(group.device || x.deviceUnnamed)}
                      onClick={() => removeDevice(group.device)}
                      onBlur={() => setArming((a) => (a === group.device ? null : a))}
                    >
                      {arming === group.device ? x.removeDeviceConfirm : '✕'}
                    </button>
                  </div>

                  <div
                    className="col-head"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: COLUMNS,
                      gap: 8,
                      padding: '8px 14px',
                      borderBottom: '1px solid var(--line)',
                    }}
                  >
                    <div>{x.colPort}</div>
                    <div>{x.colLabel}</div>
                    <div>{x.colRole}</div>
                    <div>{x.colNative}</div>
                    <div>{x.colTagged}</div>
                    <div />
                  </div>

                  {group.rows.map((p) => {
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
                          // A free port stays legible but stops competing with
                          // the ports that carry something.
                          opacity: p.role === 'unused' ? 0.62 : 1,
                        }}
                      >
                        <input
                          className="input input--mono"
                          style={{ fontSize: 11 }}
                          inputMode="numeric"
                          aria-label={x.colPort}
                          value={p.idx}
                          onChange={(e) => api.updatePort(p.id, { idx: Number(e.target.value) || 0 })}
                        />
                        <input
                          className="input"
                          style={{ fontSize: 11 }}
                          aria-label={x.colLabel}
                          value={p.label}
                          onChange={(e) => api.updatePort(p.id, { label: e.target.value })}
                        />
                        <select
                          className="input"
                          style={{ fontSize: 11 }}
                          aria-label={x.colRole}
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
                            aria-label={x.colNative}
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
                            {/* The network by its own name: every role but
                                access takes management natively, and calling
                                it MGMT was right only where that is what the
                                plan named it. */}
                            {plan?.nativeVlan
                              ? `${plan.nativeVlan} · ${
                                  networks.find((n) => n.vlan === plan.nativeVlan)?.name ?? '—'
                                }`
                              : '—'}
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
              );
            })}
          </div>
        )}
      </div>

      {/*
        * The answer, beside the thing it is an answer to.
        *
        * One profile per purpose, with the ports counted on each — so changing
        * a role and watching the count move is one glance rather than a scroll
        * to the bottom of the page and back.
        */}
      {resolved.portProfiles.length > 0 ? (
        <div className="ports-layout__side">
          <SectionLabel>{x.profilesTitle(resolved.portProfiles.length)}</SectionLabel>
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
