import { useI18n } from '@/i18n';
import type { NodePort } from '@/data/model';
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

/** The detail for one port, or the whole list when none is picked. */
export function PortList({
  ports,
  palette,
  selected,
}: {
  ports: NodePort[];
  palette: Palette;
  selected: number | null;
}) {
  const { t } = useI18n();
  const shown = selected === null ? ports : ports.filter((p) => p.idx === selected);
  if (shown.length === 0) return null;

  return (
    <div style={{ marginTop: 12 }}>
      {shown.map((p) => (
        <div
          key={p.idx}
          style={{
            display: 'grid',
            gridTemplateColumns: '34px 1fr auto',
            gap: 10,
            alignItems: 'baseline',
            padding: '7px 0',
            borderTop: '1px solid var(--line)',
            fontSize: 11,
          }}
        >
          <span className="mono" style={{ color: 'var(--text3)' }}>
            {p.idx}
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ fontWeight: 500 }}>{p.name || t.topology.portUnnamed}</span>
            {p.neighbour ? (
              <span style={{ color: 'var(--text2)' }}>
                {' → '}
                {p.neighbour}
                {p.neighbourPort ? ` (${p.neighbourPort})` : ''}
              </span>
            ) : p.up ? (
              <span style={{ color: 'var(--text3)' }}> · {t.topology.portNoLldp}</span>
            ) : null}
            <div className="mono" style={{ fontSize: 9.5, color: 'var(--text3)', marginTop: 3 }}>
              {p.vlanMode ? `VLAN: ${p.vlanMode}` : t.topology.portVlanUnknown}
              {p.poe && p.poePower ? ` · PoE ${p.poePower} W` : p.poe ? ' · PoE' : ''}
            </div>
          </span>
          <span
            className="mono"
            style={{ fontSize: 10, color: p.up ? palette.ok : 'var(--text3)', whiteSpace: 'nowrap' }}
          >
            {p.up ? `${p.speed} Mb/s` : t.topology.portDown}
          </span>
        </div>
      ))}
    </div>
  );
}
