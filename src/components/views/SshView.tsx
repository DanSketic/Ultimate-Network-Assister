import { useMemo } from 'react';
import { useI18n } from '@/i18n';
import { vars } from '@/lib/css';
import { tint, type Palette } from '@/lib/palette';
import { sshCatalogue, type SshCommand } from '@/ssh/catalogue';
import { flavourOf, type Clearance } from '@/survey/model';
import type { CopyApi } from '@/state/useAppState';
import type { SshApi, SshRun } from '@/state/useSsh';
import { Dot, Pill, ViewHeading } from '../ui';

/**
 * The SSH console.
 *
 * The clearance badge next to the command is not this component's opinion — it
 * comes from the native policy, the same code that decides whether the run is
 * allowed. So what the user reads and what the machine enforces are one answer,
 * not two that might drift.
 */

const SAFETY_TONES = ['ok', 'ok', 'warn', 'warn'] as const;

const CLEARANCE_TONE: Record<Clearance, 'ok' | 'warn' | 'bad'> = {
  readOnly: 'ok',
  mutating: 'warn',
  forbidden: 'bad',
};

const GROUP_ORDER: SshCommand['group'][] = [
  'inventory',
  'network',
  'storage',
  'services',
  'maintenance',
];

export function SshView({
  api,
  palette,
  accent,
  copy,
}: {
  api: SshApi;
  palette: Palette;
  accent: string;
  copy: CopyApi;
}) {
  const { lang, t } = useI18n();
  const selected = api.selected;

  const grouped = useMemo(() => {
    const all = sshCatalogue(lang, selected ? flavourOf(selected) : 'other');
    return GROUP_ORDER.map((group) => ({
      group,
      items: all.filter((c) => c.group === group),
    })).filter((g) => g.items.length > 0);
  }, [lang, selected]);

  if (!api.supported) {
    return (
      <Shell t={t}>
        <div className="panel" style={{ padding: '18px 20px', maxWidth: 640 }}>
          <div className="pretty" style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
            {t.survey.desktopOnlyBody}
          </div>
        </div>
      </Shell>
    );
  }

  if (api.profiles.length === 0) {
    return (
      <Shell t={t}>
        <div className="panel" style={{ padding: '18px 20px', maxWidth: 640 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 7 }}>{t.ssh.noProfiles}</div>
          <div className="pretty" style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
            {t.ssh.noProfilesBody}
          </div>
        </div>
      </Shell>
    );
  }

  const pinned = Boolean(selected?.sshFingerprint);
  const forbidden = api.clearance === 'forbidden';
  const needsConfirm = api.clearance === 'mutating';
  const canRun =
    pinned && !api.running && api.command.trim().length > 0 && !forbidden && (!needsConfirm || api.confirmed);

  return (
    <Shell t={t}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, flex: 'none' }}>
        {api.profiles.map((p) => {
          const active = p.id === selected?.id;
          return (
            <button
              key={p.id}
              type="button"
              className="tile tile--tight"
              aria-pressed={active}
              style={{
                ...vars({
                  '--tile-bg': active ? tint(accent, '14') : 'transparent',
                  '--tile-bc': active ? tint(accent, '66') : 'var(--line)',
                }),
                width: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '7px 12px',
              }}
              onClick={() => api.select(p.id)}
            >
              <Dot color={p.sshFingerprint ? palette.ok : palette.warn} size={7} />
              <span style={{ fontSize: 11.5, fontWeight: 500 }}>{p.label}</span>
              <span className="mono" style={{ fontSize: 9.5, color: 'var(--text3)' }}>
                {p.sshUsername}@{p.sshHost}
                {p.sshPort && p.sshPort !== 22 ? `:${p.sshPort}` : ''}
              </span>
            </button>
          );
        })}
      </div>

      {!pinned ? (
        <div
          className="panel panel--r11"
          style={{
            padding: '13px 16px',
            marginBottom: 16,
            flex: 'none',
            borderColor: tint(palette.warn, '66'),
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: palette.warn }}>
            {t.ssh.hostKeyPending}
          </div>
          <div className="pretty" style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 5 }}>
            {t.ssh.hostKeyPendingBody}
          </div>
        </div>
      ) : (
        <div
          className="panel panel--r11"
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            padding: '12px 15px',
            marginBottom: 16,
            flex: 'none',
          }}
        >
          <div style={{ width: 3, height: 32, borderRadius: 2, background: palette.ok }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 500 }}>
              {t.ssh.hostKeyVerified} · {selected?.sshHost}
            </div>
            <div className="mono ellipsis" style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
              {selected?.sshFingerprint}
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: '340px 1fr',
          gap: 16,
        }}
      >
        <div
          className="panel"
          style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}
        >
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              padding: '15px 16px 11px',
              borderBottom: '1px solid var(--line)',
            }}
          >
            {t.ssh.catalogue}
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 12 }}>
          {grouped.map(({ group, items }) => (
            <div key={group} style={{ marginBottom: 10 }}>
              <div className="col-head" style={{ padding: '6px 4px 5px' }}>
                {t.ssh.groups[group]}
              </div>
              {items.map((c) => {
                const active = c.command === api.command;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className="tile tile--tight"
                    aria-pressed={active}
                    style={vars({
                      '--tile-bg': active ? tint(accent, '14') : 'transparent',
                      '--tile-bc': active ? tint(accent, '66') : 'var(--line)',
                    })}
                    onClick={() => api.setCommand(c.command)}
                  >
                    <div style={{ fontSize: 11.5, fontWeight: 500 }}>{c.label}</div>
                    <div
                      className="pretty"
                      style={{ fontSize: 10, color: 'var(--text2)', marginTop: 4, lineHeight: 1.45 }}
                    >
                      {c.detail}
                    </div>
                    <div
                      className="mono ellipsis"
                      style={{ fontSize: 9.5, color: 'var(--text3)', marginTop: 5 }}
                    >
                      {c.command}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
          </div>
        </div>

        {/*
         * `auto` rather than `hidden`: at any normal window size the history
         * takes up the slack and this never scrolls, but a window short enough
         * that the command box and the rules cannot both fit should give way
         * rather than clip the bottom panel off where it cannot be reached.
         */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            minHeight: 0,
            overflow: 'auto',
          }}
        >
          <div className="panel" style={{ flex: 'none', padding: '15px 16px 16px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 12,
                marginBottom: 9,
              }}
            >
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{t.ssh.commandLabel}</div>
              {api.clearance ? (
                <Pill color={palette[CLEARANCE_TONE[api.clearance]]} tight>
                  {t.ssh.clearance[api.clearance]}
                </Pill>
              ) : null}
            </div>

            <textarea
              className="input mono"
              rows={2}
              spellCheck={false}
              value={api.command}
              placeholder={t.ssh.commandHint}
              onChange={(e) => api.setCommand(e.target.value)}
              style={{ width: '100%', resize: 'vertical', fontSize: 11.5, lineHeight: 1.6 }}
            />

            {api.clearance ? (
              <div
                className="pretty"
                style={{
                  fontSize: 11,
                  lineHeight: 1.55,
                  marginTop: 9,
                  color:
                    api.clearance === 'readOnly' ? 'var(--text3)' : palette[CLEARANCE_TONE[api.clearance]],
                }}
              >
                {api.clearance === 'readOnly'
                  ? t.ssh.clearanceReadOnlyNote
                  : api.clearance === 'mutating'
                    ? t.ssh.clearanceMutatingNote
                    : t.ssh.clearanceForbiddenNote}
              </div>
            ) : null}

            {needsConfirm ? (
              <label
                style={{
                  display: 'flex',
                  gap: 9,
                  alignItems: 'flex-start',
                  marginTop: 11,
                  fontSize: 11.5,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={api.confirmed}
                  onChange={(e) => api.setConfirmed(e.target.checked)}
                  style={{ marginTop: 2 }}
                />
                <span className="pretty">{t.ssh.confirmLabel}</span>
              </label>
            ) : null}

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 13 }}>
              <button
                type="button"
                className="btn-primary"
                disabled={!canRun}
                onClick={() => void api.run()}
                style={vars({ '--btn-bg': accent })}
              >
                {api.running ? t.ssh.runningNow : t.ssh.runButton}
              </button>
              <button
                type="button"
                className="link"
                style={{ fontSize: 10.5 }}
                onClick={() => copy.copy(api.command, 'ssh-cmd')}
              >
                {copy.label('ssh-cmd', t.ssh.copyCommand)}
              </button>
              {api.error ? (
                <span style={{ fontSize: 11, color: palette.bad, flex: 1, minWidth: 0 }}>
                  {api.error}
                </span>
              ) : null}
            </div>
          </div>

          {/*
           * Takes whatever height is left over and scrolls inside itself. A run
           * can return any amount of output, and letting that push the command
           * box off screen is the thing this layout is avoiding.
           */}
          <div
            className="panel"
            style={{
              flex: 1,
              // The heading is 41px, so this keeps it plus a hint of the first
              // row. Below that the column gives way instead of squeezing the
              // panel down to nothing.
              minHeight: 64,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '12px 16px',
                borderBottom: '1px solid var(--line)',
                flex: 'none',
              }}
            >
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{t.ssh.history}</div>
              {api.history.length > 0 ? (
                <button
                  type="button"
                  className="link"
                  style={{ fontSize: 10.5 }}
                  onClick={api.clearHistory}
                >
                  {t.ssh.clearHistory}
                </button>
              ) : null}
            </div>

            <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              {api.history.length === 0 ? (
                <div style={{ padding: '15px 16px', fontSize: 11.5, color: 'var(--text3)' }}>
                  {t.ssh.emptyHistory}
                </div>
              ) : (
                api.history.map((run) => <RunBlock key={run.id} run={run} palette={palette} t={t} />)
              )}
            </div>
          </div>

          <div className="panel" style={{ flex: 'none', padding: '15px 16px 16px' }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 11 }}>
              {t.ssh.safetyRules}
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 9,
                fontSize: 11.5,
                color: 'var(--text2)',
                lineHeight: 1.55,
              }}
            >
              {t.sshRules.map((text, i) => (
                <div key={text} style={{ display: 'flex', gap: 9 }}>
                  <Dot
                    color={palette[SAFETY_TONES[i] ?? 'ok']}
                    size={5}
                    style={{ marginTop: 6, flex: 'none' }}
                  />
                  {text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}

/**
 * The view fills the window and does not scroll as a whole.
 *
 * What you are working on — the command, its clearance, and the output it
 * produced — stays put; the catalogue is the long list, so it is the one that
 * scrolls. Scrolling the page instead would carry the command box off screen
 * while you were reading the list you meant to pick from.
 */
function Shell({ t, children }: { t: ReturnType<typeof useI18n>['t']; children: React.ReactNode }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        padding: '20px 24px 24px',
      }}
    >
      <ViewHeading title={t.ssh.title} subtitle={t.ssh.subtitle} />
      {children}
    </div>
  );
}

function RunBlock({
  run,
  palette,
  t,
}: {
  run: SshRun;
  palette: Palette;
  t: ReturnType<typeof useI18n>['t'];
}) {
  const failed = Boolean(run.error) || (run.exitStatus !== null && run.exitStatus !== 0);

  return (
    <div style={{ borderBottom: '1px solid var(--line)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 16px',
          flexWrap: 'wrap',
        }}
      >
        <Dot color={failed ? palette.bad : palette.ok} size={7} />
        <span className="mono ellipsis" style={{ fontSize: 11, flex: 1, minWidth: 120 }}>
          {run.command}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text3)' }}>{run.profileLabel}</span>
        {run.exitStatus !== null ? (
          <span className="mono" style={{ fontSize: 10, color: 'var(--text3)' }}>
            {t.ssh.exitStatus} {run.exitStatus}
          </span>
        ) : null}
        <span className="mono" style={{ fontSize: 10, color: 'var(--text3)' }}>
          {run.durationMs} ms
        </span>
      </div>

      {run.error ? (
        <div
          className="pretty"
          style={{ padding: '0 16px 12px', fontSize: 11, color: palette.bad, lineHeight: 1.55 }}
        >
          {run.error}
        </div>
      ) : null}

      {run.stdout ? <Stream text={run.stdout} /> : null}
      {run.stderr ? <Stream text={run.stderr} tone={palette.warn} label={t.ssh.stderr} /> : null}
      {!run.error && !run.stdout && !run.stderr ? (
        <div style={{ padding: '0 16px 12px', fontSize: 11, color: 'var(--text3)' }}>
          {t.ssh.noOutput}
        </div>
      ) : null}
      {run.truncated ? (
        <div style={{ padding: '0 16px 12px', fontSize: 10.5, color: palette.warn }}>
          {t.ssh.truncatedNote}
        </div>
      ) : null}
    </div>
  );
}

function Stream({ text, tone, label }: { text: string; tone?: string; label?: string }) {
  return (
    <div style={{ padding: '0 16px 12px' }}>
      {label ? (
        <div className="col-head" style={{ padding: '0 0 5px', color: tone }}>
          {label}
        </div>
      ) : null}
      <pre
        className="mono"
        style={{
          margin: 0,
          padding: '10px 12px',
          background: 'var(--panel2)',
          borderRadius: 8,
          fontSize: 10.5,
          lineHeight: 1.65,
          color: tone ?? 'var(--text2)',
          maxHeight: 320,
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {text}
      </pre>
    </div>
  );
}
