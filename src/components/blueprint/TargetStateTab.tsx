import type { ResolvedBlueprint } from '@/blueprint/model';
import { useT } from '@/i18n';
import type { Palette } from '@/lib/palette';
import { NoteRow, Pill } from '../ui';
import { Block, DataTable, Empty, Mono } from './bits';

export function TargetStateTab({
  resolved,
  palette,
}: {
  resolved: ResolvedBlueprint;
  palette: Palette;
}) {
  const t = useT();
  const errors = resolved.issues.filter((i) => i.severity === 'error');
  const warnings = resolved.issues.filter((i) => i.severity === 'warning');

  return (
    <div style={{ maxWidth: 1100 }}>
      {resolved.issues.length > 0 ? (
        <section
          className="panel"
          style={{
            padding: '14px 16px 6px',
            marginBottom: 22,
            borderColor: errors.length > 0 ? palette.bad : palette.warn,
          }}
        >
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>
            {errors.length > 0
              ? t.target.contradictions(errors.length)
              : t.target.notes(warnings.length)}
          </div>
          {resolved.issues.map((issue, i) => (
            <NoteRow
              key={i}
              color={issue.severity === 'error' ? palette.bad : palette.warn}
              style={{ padding: '10px 0', borderTop: '1px solid var(--line)' }}
            >
              <div className="pretty" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
                {issue.message}
              </div>
            </NoteRow>
          ))}
        </section>
      ) : null}

      <Block title={t.target.networks} hint={t.target.networksHint}>
        {resolved.networks.length === 0 ? (
          <Empty>{t.target.noNetworks}</Empty>
        ) : (
          <DataTable
            columns={[
              { label: 'VLAN', mono: true, width: '64px' },
              { label: t.target.colName },
              { label: t.target.colRange, mono: true },
              { label: t.target.colGateway, mono: true },
              { label: t.target.colRole },
            ]}
            rows={resolved.networks.map((n) => [
              n.vlan,
              n.name,
              n.cidr,
              n.gateway,
              <span style={{ color: 'var(--text2)' }}>{n.purpose}</span>,
            ])}
          />
        )}
      </Block>

      {resolved.ssids.length > 0 ? (
        <Block
          title={t.target.wifi}
          hint={t.target.wifiHint}
        >
          {resolved.ssids.map((s) => (
            <div key={s.name} style={{ borderBottom: '1px solid var(--line)' }}>
              <div style={{ padding: '12px 14px 8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 500 }}>{s.name}</span>
                  <Pill color={palette.idle} tight>
                    {s.security}
                  </Pill>
                  <Mono>{s.band}</Mono>
                </div>
                <div
                  className="pretty"
                  style={{ fontSize: 11, color: 'var(--text2)', marginTop: 5, lineHeight: 1.5 }}
                >
                  {s.purpose}
                </div>
              </div>
              <DataTable
                columns={[
                  { label: t.target.colKey },
                  { label: 'VLAN', mono: true },
                  { label: t.target.colNote },
                ]}
                rows={s.ppsk.map((k) => [
                  k.label,
                  k.vlan,
                  <span style={{ color: 'var(--text3)' }}>{k.note ?? '—'}</span>,
                ])}
              />
            </div>
          ))}
        </Block>
      ) : null}

      {resolved.zones.length > 0 ? (
        <Block title={t.target.zones}>
          <DataTable
            columns={[
              { label: t.target.colZone },
              { label: t.target.colNetworks, mono: true },
              { label: t.target.colRole },
            ]}
            rows={resolved.zones.map((z) => [
              <Mono>{z.name}</Mono>,
              z.vlans.length > 0 ? z.vlans.join(', ') : '—',
              <span style={{ color: 'var(--text2)' }}>{z.purpose}</span>,
            ])}
          />
        </Block>
      ) : null}

      {resolved.policies.length > 0 ? (
        <Block
          title={t.target.rules}
          hint={t.target.rulesHint}
        >
          <DataTable
            columns={[
              { label: '#', mono: true, width: '48px' },
              { label: t.target.colSource },
              { label: t.target.colTarget },
              { label: 'Port', mono: true },
              { label: t.target.colAction },
              { label: t.target.colLog },
              { label: t.target.colReason },
            ]}
            rows={resolved.policies
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((p) => [
                p.order,
                p.from,
                <span style={{ color: 'var(--text2)' }}>{p.to}</span>,
                p.ports ?? '—',
                <span
                  style={{
                    color: p.action === 'allow' ? palette.ok : palette.bad,
                    fontWeight: 500,
                  }}
                >
                  {p.action === 'allow' ? t.policy.allow : t.policy.block}
                </span>,
                p.log ? t.common.yes : t.common.none,
                <span style={{ color: 'var(--text2)' }}>{p.purpose}</span>,
              ])}
          />
        </Block>
      ) : null}

      {(resolved.addressObjects.length > 0 || resolved.portObjects.length > 0) ? (
        <Block title={t.target.objects}>
          <DataTable
            columns={[
              { label: t.target.colName },
              { label: t.target.colValue, mono: true },
              { label: t.target.colRole },
            ]}
            rows={[
              ...resolved.addressObjects.map((a) => [
                <Mono>{a.name}</Mono>,
                a.address,
                <span style={{ color: 'var(--text2)' }}>{a.purpose}</span>,
              ]),
              ...resolved.portObjects.map((p) => [
                <Mono>{p.name}</Mono>,
                `${p.protocol.toUpperCase()} ${p.ports}`,
                <span style={{ color: 'var(--text2)' }}>{p.purpose}</span>,
              ]),
            ]}
          />
        </Block>
      ) : null}

      {resolved.guests.length > 0 ? (
        <Block title={t.target.guests}>
          <DataTable
            columns={[
              { label: 'ID', mono: true, width: '56px' },
              { label: t.target.colName },
              { label: t.target.colKind, width: '56px' },
              { label: 'VLAN', mono: true, width: '60px' },
              { label: t.target.colAddress, mono: true },
              { label: 'vCPU', mono: true },
              { label: 'RAM', mono: true },
              { label: t.target.colDisk, mono: true },
              { label: 'OS' },
            ]}
            rows={resolved.guests.map((g) => [
              g.vmid,
              g.name,
              g.kind.toUpperCase(),
              g.vlan,
              g.ip ?? '—',
              g.vcpu,
              g.ram,
              g.disk,
              <span style={{ color: 'var(--text2)' }}>{g.os}</span>,
            ])}
          />
        </Block>
      ) : null}

      {resolved.storage.length > 0 ? (
        <Block title={t.target.storage}>
          <DataTable
            columns={[
              { label: t.target.colName },
              { label: t.target.colKind },
              { label: t.target.colDevices, mono: true },
              { label: t.target.colRole },
            ]}
            rows={resolved.storage.map((s) => [
              <Mono>{s.name}</Mono>,
              s.kind,
              s.devices,
              <span style={{ color: 'var(--text2)' }}>
                {s.purpose}
                {s.destructive ? (
                  <>
                    {' '}
                    <Pill color={palette.bad} tight>
                      {t.target.wipesOnCreate}
                    </Pill>
                  </>
                ) : null}
              </span>,
            ])}
          />
        </Block>
      ) : null}

      {resolved.services.length > 0 ? (
        <Block title={t.target.services}>
          <DataTable
            columns={[
              { label: t.target.colName },
              { label: t.target.colWhere, mono: true },
              { label: t.target.colPorts, mono: true },
              { label: t.target.colExposure },
              { label: t.target.colRole },
            ]}
            rows={resolved.services.map((s) => [
              s.name,
              s.host,
              s.ports,
              <Pill
                color={
                  s.exposure === 'public'
                    ? palette.warn
                    : s.exposure === 'internal'
                      ? palette.ok
                      : palette.idle
                }
                tight
              >
                {s.exposure}
              </Pill>,
              <span style={{ color: 'var(--text2)' }}>{s.purpose}</span>,
            ])}
          />
        </Block>
      ) : null}
    </div>
  );
}
