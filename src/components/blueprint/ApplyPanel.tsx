import { rollbackable, runCounts } from '@/apply/model';
import type { DiffVerdict, OperationDiff } from '@/apply/model';
import { useT, type Dict } from '@/i18n';
import type { Palette, Tone } from '@/lib/palette';
import type { ApplyApi } from '@/state/useApply';
import { Dot, Pill, SectionLabel } from '../ui';

const VERDICT_TONE: Record<DiffVerdict, Tone> = {
  create: 'ok',
  update: 'warn',
  noop: 'idle',
  conflict: 'bad',
  external: 'idle',
};

function formatValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'igen' : 'nem';
  return String(value);
}

export function ApplyPanel({ api, palette }: { api: ApplyApi; palette: Palette }) {
  const t = useT();

  if (!api.supported) {
    return (
      <div className="panel" style={{ padding: '18px 20px', maxWidth: 680 }}>
        <div className="pretty" style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
          {t.apply.desktopOnly}
        </div>
      </div>
    );
  }

  if (api.targets.length === 0) {
    return (
      <div className="panel" style={{ padding: '18px 20px', maxWidth: 680 }}>
        <div className="pretty" style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
          {t.apply.noTarget}
        </div>
      </div>
    );
  }

  const { gates, report, run } = api;
  const counts = run ? runCounts(run) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {api.error ? (
        <div
          className="panel"
          style={{
            padding: '11px 14px',
            borderColor: palette.bad,
            display: 'flex',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <span className="pretty" style={{ flex: 1, fontSize: 11.5, color: palette.bad }}>
            {api.error}
          </span>
          <button type="button" className="link" onClick={api.clearError}>
            {t.common.close}
          </button>
        </div>
      ) : null}

      <div className="panel" style={{ padding: '15px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{t.apply.target}</div>
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--text3)' }}>
            {t.apply.operationCount(api.operationCount)}
          </span>
        </div>
        <select
          className="input"
          style={{ marginTop: 10 }}
          value={api.profileId ?? ''}
          onChange={(e) => api.setProfileId(e.target.value)}
        >
          {api.targets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} · {p.baseUrl}
            </option>
          ))}
        </select>
        <div
          className="pretty"
          style={{ fontSize: 10.5, color: 'var(--text3)', lineHeight: 1.6, marginTop: 9 }}
        >
          {t.apply.scopeNote}
        </div>
      </div>

      <div className="panel" style={{ padding: '15px 16px 16px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{t.apply.gates}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          <Gate
            palette={palette}
            ready={gates.backup.ready}
            title={t.apply.backup}
            detail={
              gates.backup.ready
                ? t.apply.backupSaved(gates.backup.path ?? '')
                : t.apply.backupHint
            }
            action={
              <button
                type="button"
                className="btn-ghost"
                disabled={Boolean(api.busy)}
                onClick={() => void api.takeBackup()}
              >
                {gates.backup.ready ? t.apply.newBackup : t.apply.takeBackup}
              </button>
            }
          />
          <Gate
            palette={palette}
            ready={gates.dryRun.ready}
            title={t.apply.dryRun}
            detail={
              report
                ? t.apply.dryRunSummary(
                    report.counts.create,
                    report.counts.update,
                    report.counts.noop,
                    report.counts.conflict,
                  ) +
                  (report.counts.external > 0
                    ? ` · ${t.apply.dryRunExternal(report.counts.external)}`
                    : '')
                : t.apply.dryRunHint
            }
            action={
              <button type="button" className="btn-ghost" onClick={api.review}>
                {report ? t.apply.rerun : t.apply.runDryRun}
              </button>
            }
          />
          <Gate
            palette={palette}
            ready={gates.confirmed.ready}
            title={t.apply.confirmation}
            detail={gates.confirmed.ready ? t.apply.confirmed : t.apply.confirmationHint}
            action={
              gates.confirmed.ready ? (
                <button type="button" className="btn-ghost" onClick={api.unconfirm}>
                  {t.apply.revoke}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={!gates.dryRun.ready}
                  onClick={api.confirm}
                >
                  {t.apply.confirm}
                </button>
              )
            }
          />
        </div>

        {report && report.blockers.length > 0 ? (
          <div className="soft" style={{ marginTop: 12, padding: '11px 12px' }}>
            {report.blockers.map((b, i) => (
              <div
                key={i}
                className="pretty"
                style={{ fontSize: 11.5, color: palette.bad, lineHeight: 1.55 }}
              >
                {b}
              </div>
            ))}
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-primary btn-primary--lg"
            disabled={api.blockers.length > 0 || Boolean(api.busy) || api.writableCount === 0}
            onClick={() => void api.apply()}
          >
            {api.busy ?? t.apply.applyWith(api.writableCount)}
          </button>
          {api.blockers.length > 0 ? (
            <span className="pretty" style={{ fontSize: 10.5, color: 'var(--text3)' }}>
              {api.blockers.join(' ')}
            </span>
          ) : null}
        </div>
      </div>

      {report ? (
        <div className="panel" style={{ overflow: 'hidden' }}>
          <div
            style={{
              padding: '14px 16px 11px',
              borderBottom: '1px solid var(--line)',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {t.apply.whatChanges}
          </div>
          {report.diffs.map((diff) => (
            <DiffRow key={diff.operation.id} diff={diff} palette={palette} t={t} />
          ))}
        </div>
      ) : null}

      {run ? (
        <div className="panel" style={{ overflow: 'hidden' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '14px 16px',
              borderBottom: '1px solid var(--line)',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600 }}>{t.apply.journal}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="mono" style={{ fontSize: 10, color: 'var(--text3)' }}>
                {t.apply.journalCounts(
                  counts?.applied ?? 0,
                  counts?.failed ?? 0,
                  counts?.['rolled-back'] ?? 0,
                )}
              </span>
              <button
                type="button"
                className="btn-ghost"
                disabled={rollbackable(run).length === 0 || Boolean(api.busy)}
                onClick={() => void api.rollback()}
              >
                {t.apply.rollback}
              </button>
            </div>
          </div>

          {run.entries.map((entry, i) => (
            <div
              key={`${entry.operationId}-${i}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 10,
                padding: '11px 16px',
                borderBottom: '1px solid var(--line)',
                alignItems: 'center',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 500 }}>{entry.label}</div>
                {entry.error ? (
                  <div
                    className="pretty"
                    style={{ fontSize: 11, color: palette.bad, marginTop: 4, lineHeight: 1.5 }}
                  >
                    {entry.error}
                  </div>
                ) : null}
              </div>
              <Pill
                color={
                  entry.outcome === 'applied'
                    ? palette.ok
                    : entry.outcome === 'failed'
                      ? palette.bad
                      : palette.idle
                }
              >
                {t.apply.outcomes[entry.outcome]}
              </Pill>
            </div>
          ))}

          {run.abortedReason ? (
            <div
              className="pretty"
              style={{
                padding: '12px 16px',
                background: 'var(--panel2)',
                fontSize: 11,
                color: palette.warn,
                lineHeight: 1.6,
              }}
            >
              {run.abortedReason}
            </div>
          ) : null}

          {run.backupPath ? (
            <div
              className="mono"
              style={{
                padding: '11px 16px',
                borderTop: '1px solid var(--line)',
                fontSize: 10,
                color: 'var(--text3)',
                wordBreak: 'break-all',
              }}
            >
              {t.apply.backupPath}: {run.backupPath}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Gate({
  palette,
  ready,
  title,
  detail,
  action,
}: {
  palette: Palette;
  ready: boolean;
  title: string;
  detail: string;
  action: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
      <Dot color={ready ? palette.ok : palette.idle} size={8} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500 }}>{title}</div>
        <div
          className="pretty"
          style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 3, lineHeight: 1.5 }}
        >
          {detail}
        </div>
      </div>
      {action}
    </div>
  );
}

function DiffRow({ diff, palette, t }: { diff: OperationDiff; palette: Palette; t: Dict }) {
  const tone = palette[VERDICT_TONE[diff.verdict]];

  return (
    <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Pill color={tone}>{t.apply.verdicts[diff.verdict]}</Pill>
        <span style={{ fontSize: 11.5, fontWeight: 500 }}>{diff.operation.label}</span>
        <span className="mono" style={{ fontSize: 9.5, color: 'var(--text3)' }}>
          {t.apply.operationKind[diff.operation.kind]}
        </span>
      </div>

      {diff.note ? (
        <div
          className="pretty"
          style={{ fontSize: 11, color: 'var(--text2)', marginTop: 6, lineHeight: 1.55 }}
        >
          {diff.note}
        </div>
      ) : null}

      {diff.blockedReason ? (
        <div
          className="pretty"
          style={{ fontSize: 11, color: palette.bad, marginTop: 6, lineHeight: 1.55 }}
        >
          {diff.blockedReason}
        </div>
      ) : null}

      {diff.changes.length > 0 ? (
        <div style={{ marginTop: 8 }}>
          <SectionLabel style={{ marginBottom: 5 }}>{t.apply.fields}</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {diff.changes.map((c) => (
              <div
                key={c.field}
                className="mono"
                style={{ fontSize: 10.5, display: 'flex', gap: 8, flexWrap: 'wrap' }}
              >
                <span style={{ color: 'var(--text3)', minWidth: 110 }}>{c.field}</span>
                <span style={{ color: 'var(--text3)' }}>{formatValue(c.from)}</span>
                <span style={{ color: 'var(--text3)' }}>→</span>
                <span style={{ color: 'var(--text)' }}>{formatValue(c.to)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
