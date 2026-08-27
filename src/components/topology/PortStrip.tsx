import { useI18n } from '@/i18n';
import type { NodePort } from '@/data/model';
import { cx, vars } from '@/lib/css';
import type { Palette } from '@/lib/palette';

/**
 * A switch's ports, drawn the way they sit on the case.
 *
 * Everything here is measured — the port table and the LLDP neighbour table,
 * joined on the port index. A port with no neighbour is drawn as connected but
 * unnamed rather than guessed at: "something is plugged in that does not
 * announce itself" is exactly the state worth seeing when tracing a cable.
 */

function toneOf(port: NodePort, palette: Palette, accent: string): string {
  if (!port.enabled) return palette.idle;
  if (!port.up) return 'var(--line)';
  // The uplink is the one port whose loss takes everything below it with it.
  if (port.uplink) return accent;
  return palette.ok;
}

export function PortStrip({
  ports,
  palette,
  accent,
  selected,
  onSelect,
}: {
  ports: NodePort[];
  palette: Palette;
  accent: string;
  selected: number | null;
  onSelect: (idx: number | null) => void;
}) {
  const { t } = useI18n();
  if (ports.length === 0) return null;

  /*
   * Laid out the way the ports sit on the actual device.
   *
   * A rack switch numbers its ports 1,3,5… along the top and 2,4,6… along the
   * bottom, so that is how they are drawn. A desktop switch or an access point
   * has one row, and splitting those into two would show a layout that is not
   * on the box in front of you — which is worse than no picture, because the
   * whole point is to find the right socket.
   *
   * The highest port number decides, not how many were reported: a 24-port
   * switch with eight links is still a 24-port switch.
   */
  const highest = ports.reduce((max, p) => Math.max(max, p.idx), 0);
  const twoRows = highest >= 12;

  // Columns come from the port number, so an unreported port leaves its gap
  // rather than shifting everything after it onto the wrong socket.
  const columns = twoRows ? Math.ceil(highest / 2) : highest;
  const slots = Array.from({ length: twoRows ? 2 : 1 }, (_, row) =>
    Array.from({ length: columns }, (_, col) => {
      const idx = twoRows ? col * 2 + row + 1 : col + 1;
      return ports.find((p) => p.idx === idx) ?? null;
    }),
  );

  return (
    <div>
      <div className="col-head" style={{ padding: '0 0 7px' }}>
        {t.topology.ports}
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          padding: '9px 10px',
          background: 'var(--panel2)',
          borderRadius: 8,
          border: '1px solid var(--line)',
          overflowX: 'auto',
        }}
      >
        {slots.map((row, i) => (
          <div key={i} style={{ display: 'flex', gap: 3 }}>
            {row.map((p, col) =>
              p === null ? (
                // A socket the survey said nothing about. Drawn as an empty
                // slot so the numbering still lines up with the case.
                <span
                  key={`gap-${col}`}
                  style={{
                    width: 20,
                    height: 15,
                    flex: 'none',
                    borderRadius: 3,
                    border: '1px dashed var(--line)',
                    opacity: 0.5,
                  }}
                />
              ) : (
                <button
                  key={p.idx}
                  type="button"
                  title={`${p.idx} · ${p.name || '—'}${p.neighbour ? ` → ${p.neighbour}` : ''}`}
                  aria-pressed={selected === p.idx}
                  onClick={() => onSelect(selected === p.idx ? null : p.idx)}
                  style={{
                    width: 20,
                    height: 15,
                    flex: 'none',
                    borderRadius: 3,
                    cursor: 'pointer',
                    background: toneOf(p, palette, accent),
                    border: selected === p.idx ? '2px solid var(--text)' : '1px solid var(--line)',
                    // A powered port carries a second signal without stealing
                    // the first: the tone stays link state, the dot is PoE.
                    boxShadow: p.poe ? `inset 0 -3px 0 -1px ${palette.warn}` : 'none',
                    opacity: p.enabled ? 1 : 0.45,
                  }}
                />
              ),
            )}
          </div>
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginTop: 7,
          fontSize: 9.5,
          color: 'var(--text3)',
          flexWrap: 'wrap',
        }}
      >
        <Legend color={palette.ok} label={t.topology.portUp} />
        <Legend color="var(--line)" label={t.topology.portDown} />
        <Legend color={accent} label={t.topology.portUplink} />
        <Legend color={palette.warn} label="PoE" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 9, height: 7, borderRadius: 2, background: color, flex: 'none' }} />
      {label}
    </span>
  );
}

/** One measured fact about a port: a label, and the value under it. */
function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="fact-chip" title={`${label}: ${value}`}>
      <span className="fact-chip__k">{label}</span>
      <span className="fact-chip__v">{value}</span>
    </span>
  );
}

/** A fact that is only ever true or absent — uplink, PoE — in its own colour. */
function Flag({ label, color }: { label: string; color: string }) {
  return (
    <span className="fact-chip fact-chip--flag mono" style={vars({ '--tone': color })}>
      {label}
    </span>
  );
}

/**
 * The detail for one port, or the whole list when none is picked.
 *
 * Three questions, in the order they get asked: which socket, what is on the
 * other end, and what the port is set to. The first two are the line you read;
 * the third is the chips below it, which are there to be scanned rather than
 * read — a row of them lines up with the row above, so an odd one out shows
 * itself without anybody comparing values by hand.
 */
export function PortList({
  ports,
  palette,
  accent,
  selected,
  onSelect,
}: {
  ports: NodePort[];
  palette: Palette;
  accent: string;
  selected: number | null;
  onSelect: (idx: number | null) => void;
}) {
  const { t } = useI18n();
  const x = t.topology;
  const shown = selected === null ? ports : ports.filter((p) => p.idx === selected);
  if (shown.length === 0) return null;

  return (
    <div style={{ marginTop: 12 }}>
      {selected !== null ? (
        <button
          type="button"
          className="btn-ghost"
          style={{ fontSize: 10.5, padding: '3px 8px', marginBottom: 8 }}
          onClick={() => onSelect(null)}
        >
          {x.portAll}
        </button>
      ) : null}
      {shown.map((p) => {
        const tone = toneOf(p, palette, accent);
        const forward =
          p.forward && p.forward in x.portForward
            ? x.portForward[p.forward as keyof typeof x.portForward]
            : '';

        const far = p.neighbour
          ? `${p.neighbour}${p.neighbourPort ? ` (${p.neighbourPort})` : ''}`
          : '';

        if (selected === null) {
          return (
            <button
              key={p.idx}
              type="button"
              className={cx('port-row', 'port-row--compact', !p.up && 'port-row--idle')}
              style={vars({ '--tone': tone })}
              onClick={() => onSelect(p.idx)}
            >
              <span className="port-row__num">{p.idx}</span>
              <span className="port-row__what">
                {p.name || x.portUnnamed}
                {far ? <span className="port-row__far">{` → ${far}`}</span> : null}
              </span>
              <span
                className="port-row__state"
                style={{ color: p.up ? 'var(--text2)' : 'var(--text3)' }}
              >
                {p.poe ? (
                  <span
                    title="PoE"
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      background: palette.warn,
                      flex: 'none',
                    }}
                  />
                ) : null}
                {p.up ? `${p.speed}` : '—'}
              </span>
            </button>
          );
        }

        return (
          <div
            key={p.idx}
            className={cx('port-row', 'port-row--open', !p.up && 'port-row--idle')}
            style={vars({ '--tone': tone })}
          >
            <span className="port-row__num">{p.idx}</span>

            <div style={{ minWidth: 0 }}>
              <div className="port-row__what">
                {p.name || x.portUnnamed}
                {far ? (
                  <span className="port-row__far">{` → ${far}`}</span>
                ) : p.up ? (
                  <span className="port-row__quiet"> · {x.portNoLldp}</span>
                ) : null}
              </div>

              <div className="fact-chips">
                {/* Who, exactly. A name says what it is; these say which one. */}
                {p.neighbourIp ? <Chip label="IP" value={p.neighbourIp} /> : null}
                {p.neighbourMac ? <Chip label="MAC" value={p.neighbourMac} /> : null}

                {/* And what the port itself is set to. */}
                {p.profile ? <Chip label={x.portProfile} value={p.profile} /> : null}
                {p.nativeVlan || p.nativeNetwork ? (
                  <Chip
                    label={x.portNative}
                    value={
                      p.nativeVlan
                        ? `${p.nativeVlan}${p.nativeNetwork ? ` · ${p.nativeNetwork}` : ''}`
                        : p.nativeNetwork
                    }
                  />
                ) : null}
                {forward ? <Chip label={x.portForwardLabel} value={forward} /> : null}
                {p.vlanMode ? <Chip label="VLAN" value={p.vlanMode} /> : null}

                {p.uplink ? <Flag label={x.portUplinkRole} color={accent} /> : null}
                {p.poe ? (
                  <Flag label={p.poePower ? `PoE ${p.poePower} W` : 'PoE'} color={palette.warn} />
                ) : null}
                {!p.enabled ? <Flag label={x.portForward.disabled} color={palette.idle} /> : null}

                {/* A port nobody configured says so, rather than showing a row
                    of chips with nothing in them. */}
                {!p.profile && !p.vlanMode ? (
                  <span className="fact-chip fact-chip--flag" style={{ color: 'var(--text3)' }}>
                    {x.portNoProfile}
                  </span>
                ) : null}
              </div>
            </div>

            <span
              className="port-row__state"
              style={{ color: p.up ? 'var(--text2)' : 'var(--text3)' }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: tone,
                  flex: 'none',
                }}
              />
              {p.up ? `${p.speed} Mb/s` : x.portDown}
            </span>
          </div>
        );
      })}
    </div>
  );
}
