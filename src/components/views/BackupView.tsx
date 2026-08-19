import { demoCheckpoints, demoRestoreTestNote } from '@/data/operations';
import type { BackupEvidence } from '@/data/model';
import { useI18n } from '@/i18n';
import type { Palette } from '@/lib/palette';
import type { Estate } from '@/survey/mapping';
import { Dot, Pill, ViewHeading } from '../ui';

/**
 * Backup and recovery.
 *
 * On a surveyed estate every number here is measured: the jobs come from the
 * cluster's backup configuration, the evidence from the files those jobs
 * actually left behind, and the verification state from the store that checked
 * them. Where the store cannot verify, the view says exactly that instead of
 * quietly downgrading to a warning colour.
 *
 * One thing is deliberately *not* claimed: a restore test. Proxmox does not
 * record one anywhere, so the application cannot show one — and a restore that
 * has never been tried is the single most common reason a backup turns out to
 * be worthless.
 */

const COLUMNS = '1.3fr 1.1fr .9fr .8fr .9fr .8fr';

function evidenceTone(evidence: BackupEvidence): 'ok' | 'bad' | 'warn' {
  if (evidence === 'Igazolt') return 'ok';
  if (evidence === 'Hiányzik') return 'bad';
  return 'warn';
}

export function BackupView({ estate, palette }: { estate: Estate; palette: Palette }) {
  const { lang, t } = useI18n();
  const live = estate.source === 'survey';
  const {
    jobs, jobsReadable, unprotected, guestCount, protectedCount, newestAgeDays, verifiable, stores,
  } = estate.backups;

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px 28px' }}>
      <ViewHeading
        title={t.backup.title}
        subtitle={t.backup.subtitle}
        right={
          <Pill color={live ? palette.ok : palette.idle}>
            {live ? t.survey.liveData : t.survey.demoData}
          </Pill>
        }
      />

      {/*
       * Two different things look alike here and must not read alike: a cluster
       * with no backup, and a token that was not allowed to ask. Only the first
       * is a finding; the second is a gap in the survey.
       */}
      {live && jobs.length === 0 && !jobsReadable ? (
        <div className="panel" style={{ padding: '16px 18px', marginBottom: 16 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: palette.warn }}>
            {t.backup.jobsUnreadable}
          </div>
          <div className="pretty" style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 6 }}>
            {t.backup.jobsUnreadableBody}
          </div>
        </div>
      ) : null}

      {live && jobs.length === 0 && jobsReadable ? (
        <div className="panel" style={{ padding: '16px 18px', marginBottom: 16 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: palette.bad }}>
            {t.backup.noJobs}
          </div>
          <div className="pretty" style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 6 }}>
            {t.backup.noJobsBody}
          </div>

          <div className="sect" style={{ marginTop: 13, marginBottom: 6 }}>
            {t.backup.whereToAdd}
          </div>
          <div
            className="pretty"
            style={{ fontSize: 11.5, color: 'var(--text2)', lineHeight: 1.6 }}
          >
            {t.backup.whereToAddBody}
          </div>
          <div className="mono" style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 7 }}>
            {t.backup.whereToAddPath}
          </div>
          <div
            className="pretty"
            style={{
              fontSize: 11,
              color: stores.length > 0 ? 'var(--text2)' : palette.warn,
              marginTop: 9,
              lineHeight: 1.55,
            }}
          >
            {stores.length > 0
              ? t.backup.whereToAddStore(stores[0]!.name, stores[0]!.freeLabel)
              : t.backup.whereToAddNoStore}
          </div>
        </div>
      ) : null}

      {jobs.length > 0 ? (
        <div className="panel" style={{ overflow: 'hidden' }}>
          <div
            className="col-head"
            style={{
              display: 'grid',
              gridTemplateColumns: COLUMNS,
              gap: 10,
              padding: '11px 16px',
              borderBottom: '1px solid var(--line)',
            }}
          >
            <div>{t.backup.colJob}</div>
            <div>{t.backup.colTarget}</div>
            <div>{t.backup.colSchedule}</div>
            <div>{t.backup.colLastRun}</div>
            <div>{t.backup.colRetention}</div>
            <div>{t.backup.colEvidence}</div>
          </div>
          {jobs.map((b) => (
            <div
              key={`${b.name}-${b.target}`}
              className="row-hover"
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--line)',
                fontSize: 11.5,
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: COLUMNS,
                  gap: 10,
                  alignItems: 'center',
                }}
              >
                <div style={{ fontWeight: 500 }}>{b.name}</div>
                <div className="mono" style={{ color: 'var(--text2)', fontSize: 10.5 }}>
                  {b.target}
                </div>
                <div className="mono" style={{ color: 'var(--text2)', fontSize: 10.5 }}>
                  {b.schedule}
                </div>
                <div style={{ color: 'var(--text2)' }}>{b.lastRun}</div>
                <div className="mono" style={{ color: 'var(--text2)', fontSize: 10 }}>
                  {b.retention}
                </div>
                <div>
                  <Pill color={palette[evidenceTone(b.evidence)]}>
                    {t.labels.evidence[b.evidence]}
                  </Pill>
                </div>
              </div>
              {b.reason ? (
                <div
                  className="pretty"
                  style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 6, lineHeight: 1.5 }}
                >
                  {b.reason}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 16,
          marginTop: 16,
        }}
      >
        <div className="panel" style={{ padding: '15px 16px' }}>
          <div style={{ fontSize: 12.5, fontWeight: 600 }}>{t.backup.coverage}</div>
          {live ? (
            <>
              <div
                style={{ fontSize: 26, fontWeight: 300, marginTop: 8, letterSpacing: '-.02em' }}
              >
                {protectedCount}
                <span style={{ fontSize: 14, color: 'var(--text3)' }}> / {guestCount}</span>
              </div>
              <div
                className="pretty"
                style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 6, lineHeight: 1.55 }}
              >
                {unprotected.length === 0
                  ? t.backup.coverageAll
                  : t.backup.coverageMissing(unprotected.length)}
              </div>
              {unprotected.length > 0 ? (
                <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {unprotected.slice(0, 6).map((g) => (
                    <div
                      key={g.vmid}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}
                    >
                      <Dot color={palette.bad} size={5} />
                      <span className="mono" style={{ color: 'var(--text3)', fontSize: 10 }}>
                        {g.vmid}
                      </span>
                      <span className="ellipsis">{g.name}</span>
                    </div>
                  ))}
                  {unprotected.length > 6 ? (
                    <div style={{ fontSize: 10.5, color: 'var(--text3)' }}>
                      {t.backup.andMore(unprotected.length - 6)}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <div
              className="pretty"
              style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 8, lineHeight: 1.55 }}
            >
              {t.backup.liveOnly}
            </div>
          )}
        </div>

        <div className="panel" style={{ padding: '15px 16px' }}>
          <div style={{ fontSize: 12.5, fontWeight: 600 }}>{t.backup.restoreTest}</div>
          <div
            className="pretty"
            style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 9, lineHeight: 1.55 }}
          >
            {live ? t.backup.restoreNotProvable : demoRestoreTestNote(lang)}
          </div>
          {live ? (
            <div style={{ marginTop: 10 }}>
              <Pill color={palette.warn} tight>
                {t.labels.provenance['Nem ellenőrizhető']}
              </Pill>
            </div>
          ) : null}
        </div>

        <div className="panel" style={{ padding: '15px 16px' }}>
          <div style={{ fontSize: 12.5, fontWeight: 600 }}>
            {live ? t.backup.stores : t.backup.checkpoints}
          </div>
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 11, fontSize: 11.5 }}
          >
            {live ? (
              <>
                {stores.length === 0 ? (
                  <span style={{ color: 'var(--text3)' }}>{t.backup.noStores}</span>
                ) : (
                  stores.map((s) => (
                    <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <span className="ellipsis" style={{ color: 'var(--text2)' }}>
                        {s.name}
                      </span>
                      <span
                        className="mono"
                        style={{
                          fontSize: 10.5,
                          color: s.usedPercent > 85 ? palette.bad : 'var(--text)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {s.usedPercent}% · {s.freeLabel}
                      </span>
                    </div>
                  ))
                )}
                <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 3, lineHeight: 1.5 }}>
                  {newestAgeDays === null
                    ? t.backup.noBackupsAtAll
                    : t.backup.newestBackup(newestAgeDays)}
                  {' · '}
                  {verifiable ? t.backup.storeVerifies : t.backup.storeCannotVerify}
                </div>
              </>
            ) : (
              demoCheckpoints(lang).map((c) => (
                <div key={c.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ color: 'var(--text2)' }}>{c.label}</span>
                  <span className="mono" style={{ fontSize: 10.5 }}>
                    {c.when}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
