import { rollbackable, runCounts } from '@/apply/model';
import type { DiffVerdict, FieldChange, OperationDiff } from '@/apply/model';
import { useT, type Dict } from '@/i18n';
import { cx, vars } from '@/lib/css';
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

/*
 * The order a dry run is read in.
 *
 * Worst first: what would stop the run, then what it would make, then what it
 * would change, and last the two kinds of nothing — already correct, and
 * provided by something else. Grouped rather than interleaved because the
 * question in front of someone reviewing this is "is there anything here I did
 * not intend", and a list that mixes fifteen already-correct rows into three
 * real changes answers it badly.
 */
const VERDICT_ORDER: DiffVerdict[] = ['conflict', 'create', 'update', 'external', 'noop'];

/** One value as it is shown: a chip, sometimes several for one field. */
interface Chip {
  text: string;
  /** Nothing was measured or nothing is set — shown as an em dash, not as a 0. */
  empty?: boolean;
  /** A yes/no, coloured by which it is. */
  tone?: string;
}

/*
 * A field value, broken into what the eye can take in at a glance.
 *
 * The dry run used to print every value with `String()`, which turned a list of
 * VLANs into `10,20,30`, a boolean into a hard-coded Hungarian word — in the
 * English interface too — and an unset value into a bare dash that read as if
 * it were the value. Each of those is a different kind of thing, and each gets
 * its own shape here.
 */
function chipsOf(value: unknown, palette: Palette, t: Dict): Chip[] {
  if (Array.isArray(value)) {
    if (value.length === 0) return [{ text: '—', empty: true }];
    return value.map((v) => ({ text: String(v) }));
  }
  if (value === undefined || value === null || value === '') {
    return [{ text: '—', empty: true }];
  }
  if (typeof value === 'boolean') {
    return [{ text: value ? t.common.yes : t.common.no, tone: value ? palette.ok : palette.idle }];
  }
  return [{ text: String(value) }];
}

/**
 * What a field is called, in words.
 *
 * The controller's own key is what gets written, so it stays reachable — it is
 * the row's tooltip — but `native_vlan` is not a name anybody chose to read.
 * A key with no entry falls back to itself with the underscores opened out,
 * which is what the firewall's membership field needs: its name moves between
 * releases and is discovered at run time, so it cannot be listed here.
 */
function fieldLabel(field: string, t: Dict): string {
  const known = (t.apply.field as Record<string, string | undefined>)[field];
  return known ?? field.replace(/_/g, ' ');
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

  /*
   * Nothing to write, said before a target is asked for.
   *
   * A blueprint that describes no UniFi object — the single-host preset is the
   * whole of one — would otherwise be told to add a UniFi profile and accept
   * its certificate, which is advice for a plan it does not have.
   */
  if (api.operationCount === 0) {
    return (
      <div className="panel" style={{ padding: '18px 20px', maxWidth: 680 }}>
        <div className="pretty" style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
          {t.apply.nothingToApply}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{t.apply.whatChanges}</div>

          {VERDICT_ORDER.map((verdict) => {
            const diffs = report.diffs.filter((d) => d.verdict === verdict);
            if (diffs.length === 0) return null;
            const tone = palette[VERDICT_TONE[verdict]];

            return (
              <section key={verdict}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 11 }}
                >
                  <Dot color={tone} />
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                    {t.apply.verdicts[verdict]}
                  </div>
                  {/* The hairline carries the eye to the count, as in the module list. */}
                  <div
                    style={{
                      flex: 1,
                      height: 2,
                      borderRadius: 1,
                      background: 'var(--line)',
                      minWidth: 40,
                    }}
                  />
                  <div className="mono" style={{ fontSize: 10.5, color: 'var(--text3)' }}>
                    {diffs.length}
                  </div>
                </div>

                <div className="diff-grid">
                  {diffs.map((diff) => (
                    <DiffCard key={diff.operation.id} diff={diff} palette={palette} t={t} />
                  ))}
                </div>
              </section>
            );
          })}
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

/**
 * One field of one operation.
 *
 * On a create there is nothing to compare against, so only the value being
 * written is shown — the `— →` that used to open every line of a fresh plan
 * said "there was nothing before", which is the one thing "create" already
 * says. On an update both sides are there, the old one struck through, because
 * the question then really is what is being replaced.
 */
function FieldRow({
  change,
  palette,
  t,
}: {
  change: FieldChange;
  palette: Palette;
  t: Dict;
}) {
  const from = chipsOf(change.from, palette, t);
  const to = chipsOf(change.to, palette, t);
  // Nothing to replace: a create, or a field that had no value before.
  const replaces = !(from.length === 1 && from[0]!.empty);

  const chip = (c: Chip, i: number, previous?: boolean) => (
    <span
      key={`${c.text}-${i}`}
      className={cx('val', c.empty && 'val--empty', previous && 'val--from')}
      style={c.tone && !previous ? vars({ '--val': c.tone }) : undefined}
    >
      {c.text}
    </span>
  );

  return (
    <div className="diff-fields__row">
      <span className="diff-fields__label" title={change.field}>
        {fieldLabel(change.field, t)}
      </span>
      <span className="diff-fields__values">
        {replaces ? (
          <>
            {from.map((c, i) => chip(c, i, true))}
            <span className="diff-fields__arrow" aria-hidden="true">
              →
            </span>
          </>
        ) : null}
        {to.map((c, i) => chip(c, i))}
      </span>
    </div>
  );
}

/**
 * One operation of the dry run, as a card.
 *
 * A row per operation ran the width of the window for the sake of a label and
 * two short values, so a dry run of a dozen operations was a column of mostly
 * empty lines. The card is the shape the module list already uses, and the
 * grid fits as many across as the window allows.
 *
 * The verdict is on the card twice over — as the stripe along the top and as
 * the pill — because the cards are grouped by verdict and a card read on its
 * own, out of its group, still has to say what it is.
 */
function DiffCard({ diff, palette, t }: { diff: OperationDiff; palette: Palette; t: Dict }) {
  const tone = palette[VERDICT_TONE[diff.verdict]];

  return (
    <div className="diff-card" style={vars({ '--stripe': tone })}>
      <span className="diff-card__stripe" />

      <div className="diff-card__head">
        <Pill color={tone} tight>
          {t.apply.verdicts[diff.verdict]}
        </Pill>
        <span className="mono" style={{ fontSize: 9.5, color: 'var(--text3)' }}>
          {t.apply.operationKind[diff.operation.kind]}
        </span>
      </div>

      <div className="diff-card__body">
        <div style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.35 }}>
          {diff.operation.label}
        </div>

        {diff.note ? (
          <div
            className="pretty"
            style={{ fontSize: 10.5, color: 'var(--text2)', marginTop: 6, lineHeight: 1.5 }}
          >
            {diff.note}
          </div>
        ) : null}

        {diff.blockedReason ? (
          <div
            className="pretty"
            style={{ fontSize: 10.5, color: palette.bad, marginTop: 6, lineHeight: 1.5 }}
          >
            {diff.blockedReason}
          </div>
        ) : null}
      </div>

      {diff.changes.length > 0 ? (
        <div className="diff-card__foot">
          <SectionLabel style={{ marginBottom: 7 }}>{t.apply.fields}</SectionLabel>
          <div className="diff-fields">
            {diff.changes.map((c) => (
              <FieldRow key={c.field} change={c} palette={palette} t={t} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
