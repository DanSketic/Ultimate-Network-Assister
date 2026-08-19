import { useEffect, useState } from 'react';
import { effectiveLevel, isTemplateCommand } from '@/blueprint/automation';
import { type AutomationLevel, type Plan, type PlanAction, type PlanStep } from '@/blueprint/model';
import { useT } from '@/i18n';
import { vars } from '@/lib/css';
import type { Palette } from '@/lib/palette';
import type { CopyApi } from '@/state/useAppState';
import { usePlanRunner, type PlanRun, type PlanRunnerApi } from '@/state/usePlanRunner';
import type { Clearance, Profile } from '@/survey/model';
import { Pill, StatCard } from '../ui';

const MODES: AutomationLevel[] = ['manual', 'assisted', 'auto'];

const CLEARANCE_TONE: Record<Clearance, 'ok' | 'warn' | 'bad'> = {
  readOnly: 'ok',
  mutating: 'warn',
  forbidden: 'bad',
};

export function PlanTab({
  plan,
  profiles,
  palette,
  accent,
  copy,
}: {
  plan: Plan;
  profiles: Profile[];
  palette: Palette;
  accent: string;
  copy: CopyApi;
}) {
  const t = useT();
  const runner = usePlanRunner(profiles);
  const [mode, setMode] = useState<AutomationLevel>('assisted');
  const [open, setOpen] = useState<string | null>(plan.steps[0]?.id ?? null);

  const modeHint: Record<AutomationLevel, string> = {
    manual: t.plan.modeManual,
    assisted: t.plan.modeAssisted,
    auto: t.plan.modeAuto,
  };

  const toneFor = (level: AutomationLevel) =>
    level === 'auto' ? palette.ok : level === 'assisted' ? accent : palette.idle;

  return (
    <div style={{ maxWidth: 1100 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))',
          gap: 12,
          marginBottom: 18,
        }}
      >
        <StatCard
          label={t.plan.step}
          value={String(plan.steps.length)}
          hint={t.plan.modules(plan.modules.length)}
        />
        <StatCard
          label={t.plan.estimatedTime}
          value={String(Math.round((plan.totalMinutes / 60) * 10) / 10)}
          suffix={t.plan.hours}
          hint={t.plan.minutesTotal(plan.totalMinutes)}
        />
        <StatCard
          label={t.plan.automatable}
          value={String(plan.counts.auto)}
          hint={t.plan.automatableHint}
          valueColor={palette.ok}
        />
        <StatCard
          label={t.plan.assisted}
          value={String(plan.counts.assisted)}
          hint={t.plan.assistedHint}
          valueColor={accent}
        />
        <StatCard
          label={t.plan.manualOnly}
          value={String(plan.counts.manual)}
          hint={t.plan.ofWhichDestructive(plan.destructiveCount)}
        />
      </div>

      <div className="panel" style={{ padding: '13px 15px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 500 }}>{t.plan.executionMode}</span>
          <div
            style={{
              display: 'flex',
              padding: 3,
              background: 'var(--panel2)',
              border: '1px solid var(--line)',
              borderRadius: 8,
              gap: 2,
            }}
          >
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                className="subtab"
                aria-pressed={mode === m}
                style={vars({
                  '--tab-bg': mode === m ? 'var(--panel)' : 'transparent',
                  '--tab-fg': mode === m ? 'var(--text)' : 'var(--text2)',
                })}
                onClick={() => setMode(m)}
              >
                {t.blueprint.automation[m]}
              </button>
            ))}
          </div>
        </div>
        <div
          className="pretty"
          style={{ fontSize: 11, color: 'var(--text2)', marginTop: 9, lineHeight: 1.55 }}
        >
          {modeHint[mode]}
        </div>

        {runner.supported ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
              marginTop: 12,
              paddingTop: 12,
              borderTop: '1px solid var(--line)',
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 500 }}>{t.plan.sshTarget}</span>
            {runner.profiles.length > 0 ? (
              <>
                <select
                  className="input"
                  style={{ maxWidth: 320, fontSize: 11.5 }}
                  value={runner.selected?.id ?? ''}
                  onChange={(e) => runner.select(e.target.value)}
                >
                  {runner.profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} · {p.sshUsername}@{p.sshHost}
                    </option>
                  ))}
                </select>
                <span
                  className="pretty"
                  style={{ fontSize: 11, color: 'var(--text2)', flex: 1, minWidth: 220 }}
                >
                  {t.plan.sshTargetNote}
                </span>
              </>
            ) : (
              <span className="pretty" style={{ fontSize: 11, color: 'var(--text2)' }}>
                {t.plan.sshNoProfiles}
              </span>
            )}
          </div>
        ) : null}
      </div>

      {plan.modules.map((pm) => (
        <section key={pm.module.id} style={{ marginBottom: 24 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 10,
              marginBottom: 10,
              flexWrap: 'wrap',
            }}
          >
            <span className="mono" style={{ fontSize: 11, color: 'var(--text3)' }}>
              {pm.module.code}.
            </span>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>{pm.module.title}</span>
            {pm.minutes > 0 ? (
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--text3)' }}>
                {pm.minutes} perc
              </span>
            ) : null}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pm.steps.map((step, i) => (
              <StepCard
                key={step.id}
                step={step}
                index={i + 1}
                effective={effectiveLevel(mode, step.capability)}
                expanded={open === step.id}
                onToggle={() => setOpen(open === step.id ? null : step.id)}
                palette={palette}
                accent={accent}
                toneFor={toneFor}
                copy={copy}
                runner={runner}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function StepCard({
  step,
  index,
  effective,
  expanded,
  onToggle,
  palette,
  accent,
  toneFor,
  copy,
  runner,
}: {
  step: PlanStep;
  index: number;
  effective: AutomationLevel;
  expanded: boolean;
  onToggle: () => void;
  palette: Palette;
  accent: string;
  toneFor: (level: AutomationLevel) => string;
  copy: CopyApi;
  runner: PlanRunnerApi;
}) {
  const t = useT();
  const capped = effective !== step.capability;

  return (
    <div
      className="panel panel--r10"
      style={{ overflow: 'hidden', borderColor: expanded ? 'var(--line2)' : 'var(--line)' }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        style={{
          display: 'flex',
          width: '100%',
          gap: 11,
          alignItems: 'flex-start',
          padding: '12px 14px',
          background: 'transparent',
          border: 0,
          textAlign: 'left',
          cursor: 'pointer',
          fontFamily: 'inherit',
          color: 'inherit',
        }}
      >
        <span
          className="mono"
          style={{
            width: 20,
            height: 20,
            flex: 'none',
            borderRadius: '50%',
            border: `1px solid ${toneFor(effective)}`,
            color: toneFor(effective),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 9.5,
            marginTop: 1,
          }}
        >
          {index}
        </span>

        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, fontWeight: 500 }}>{step.title}</span>
            <Pill color={toneFor(effective)} tight>
              {t.blueprint.automation[effective]}
            </Pill>
            <Pill
              color={
                step.risk === 'high'
                  ? palette.bad
                  : step.risk === 'medium'
                    ? palette.warn
                    : palette.idle
              }
              tight
            >
              {t.blueprint.risk[step.risk]}
            </Pill>
            {step.requiresBackup ? (
              <Pill color={palette.warn} tight>
                {t.plan.backupRequired}
              </Pill>
            ) : null}
            {step.requiresLocalConsole ? (
              <Pill color={palette.warn} tight>
                {t.plan.localConsole}
              </Pill>
            ) : null}
            {step.minutes > 0 ? (
              <span className="mono" style={{ fontSize: 10, color: 'var(--text3)' }}>
                {step.minutes} {t.common.minutes}
              </span>
            ) : null}
          </span>

          <span
            className="pretty"
            style={{
              display: 'block',
              fontSize: 11,
              color: 'var(--text2)',
              marginTop: 5,
              lineHeight: 1.5,
            }}
          >
            {step.detail}
          </span>

          {capped ? (
            <span
              style={{ display: 'block', fontSize: 10.5, color: palette.idle, marginTop: 6 }}
            >
              {t.plan.cappedBelow(t.blueprint.automation[effective].toLowerCase())}
            </span>
          ) : null}
          {step.capabilityReason ? (
            <span
              className="pretty"
              style={{
                display: 'block',
                fontSize: 10.5,
                color: palette.warn,
                marginTop: 6,
                lineHeight: 1.5,
              }}
            >
              {step.capabilityReason}
            </span>
          ) : null}
        </span>

        <span style={{ color: 'var(--text3)', fontSize: 10, marginTop: 4 }}>
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {expanded ? (
        <div style={{ padding: '0 14px 14px 45px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {step.prechecks.length > 0 ? (
            <ChecklistBlock title={t.plan.precheck} items={step.prechecks} color={palette.warn} />
          ) : null}

          {step.actions.length > 0 ? (
            <div>
              <div className="sect" style={{ marginBottom: 8 }}>
                {t.plan.todo}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {step.actions.map((a, i) => (
                  <ActionCard
                    key={`${step.id}-${i}`}
                    actionKey={`${step.id}-${i}`}
                    action={a}
                    localConsole={step.requiresLocalConsole}
                    palette={palette}
                    accent={accent}
                    copy={copy}
                    runner={runner}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {step.verification.length > 0 ? (
            <ChecklistBlock title={t.plan.verification} items={step.verification} color={accent} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * One thing to do, and — where it is a command and a route exists — the means
 * to do it.
 *
 * The clearance shown here is the native policy's, fetched for this exact text.
 * Nothing is offered while it is unknown: an unclassified command is one the
 * far side has not agreed to yet.
 */
function ActionCard({
  actionKey,
  action,
  localConsole,
  palette,
  accent,
  copy,
  runner,
}: {
  actionKey: string;
  action: PlanAction;
  /** The step this belongs to has to be done at the machine, not over SSH. */
  localConsole: boolean;
  palette: Palette;
  accent: string;
  copy: CopyApi;
  runner: PlanRunnerApi;
}) {
  const t = useT();
  // Two reasons a command is not ours to run at all, both decided before
  // anything is asked of the far side: it is a shape to fill in, or it
  // destroys something. The native policy is asked about the rest.
  const template = action.kind === 'command' && isTemplateCommand(action.body);
  const isCommand = action.kind === 'command' && !template && !action.destructive;

  // `classify` is stable and caches by command text, so this settles after the
  // first render of each distinct command.
  const { classify } = runner;
  useEffect(() => {
    if (isCommand) classify(action.body);
  }, [isCommand, action.body, classify]);

  const clearance = isCommand ? runner.clearanceOf(action.body) : null;
  const run = runner.runOf(actionKey);
  const busy = runner.running(actionKey);

  /*
   * A step marked "local console" is one whose change can cut the session a
   * command would travel over — so on those, reading is still fine and
   * changing anything is not. Everywhere else the policy's own verdict is
   * enough.
   */
  const consoleOnly = localConsole && clearance !== null && clearance !== 'readOnly';
  const offered =
    isCommand && runner.ready && clearance !== null && clearance !== 'forbidden' && !consoleOnly;
  const needsApproval = offered && clearance === 'mutating';
  const approved = runner.approved(actionKey, action.body);

  return (
    <div
      style={{
        border: `1px solid ${action.destructive ? palette.bad : 'var(--line)'}`,
        borderRadius: 9,
        overflow: 'hidden',
        background: 'var(--panel2)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          padding: '7px 11px',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 500 }}>{action.label}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {clearance ? (
            <Pill color={palette[CLEARANCE_TONE[clearance]]} tight>
              {t.ssh.clearance[clearance]}
            </Pill>
          ) : null}
          <Pill color={action.destructive ? palette.bad : palette.idle} tight>
            {action.kind === 'api'
              ? t.plan.actionApi
              : action.kind === 'command'
                ? t.plan.actionCommand
                : t.plan.actionUi}
          </Pill>
          <span className="mono" style={{ fontSize: 9.5, color: 'var(--text3)' }}>
            {action.target}
          </span>
          <button
            type="button"
            className="link"
            style={{ fontSize: 10 }}
            onClick={() => copy.copy(action.body, actionKey)}
          >
            {copy.label(actionKey)}
          </button>
        </span>
      </div>

      <pre
        className="mono"
        style={{
          margin: 0,
          padding: '10px 11px',
          fontSize: 10.5,
          lineHeight: 1.65,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          color: 'var(--text)',
        }}
      >
        {action.body}
      </pre>

      {action.kind === 'command' && runner.ready && !offered ? (
        <div
          className="pretty"
          style={{
            padding: '0 11px 10px',
            fontSize: 10.5,
            lineHeight: 1.55,
            color: action.destructive || clearance === 'forbidden' ? palette.bad : 'var(--text3)',
          }}
        >
          {action.destructive || clearance === 'forbidden'
            ? t.ssh.clearanceForbiddenNote
            : template
              ? t.plan.sshTemplateNote
              : consoleOnly
                ? t.plan.sshLocalConsoleNote
                : t.plan.sshClassifying}
        </div>
      ) : null}

      {offered ? (
        <div style={{ padding: '0 11px 11px' }}>
          {needsApproval ? (
            <label
              style={{
                display: 'flex',
                gap: 9,
                alignItems: 'flex-start',
                margin: '0 0 10px',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={approved}
                onChange={(e) => runner.approve(actionKey, action.body, e.target.checked)}
                style={{ marginTop: 2 }}
              />
              <span className="pretty">{t.ssh.confirmLabel}</span>
            </label>
          ) : null}

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-primary"
              disabled={busy || (needsApproval && !approved)}
              onClick={() => void runner.run(actionKey, action.body)}
              style={vars({ '--btn-bg': accent })}
            >
              {busy ? t.ssh.runningNow : t.plan.sshRunHere}
            </button>
            <span className="mono" style={{ fontSize: 9.5, color: 'var(--text3)' }}>
              {runner.selected?.label} · {runner.selected?.sshHost}
            </span>
          </div>
        </div>
      ) : null}

      {run ? <RunOutput run={run} palette={palette} /> : null}
    </div>
  );
}

/** What the far side said. Kept next to the command that produced it. */
function RunOutput({ run, palette }: { run: PlanRun; palette: Palette }) {
  const t = useT();
  const failed = run.error !== undefined || (run.exitStatus !== null && run.exitStatus !== 0);
  const tone = failed ? palette.bad : palette.ok;

  return (
    <div style={{ borderTop: '1px solid var(--line)', padding: '9px 11px' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Pill color={tone} tight>
          {run.error !== undefined
            ? t.plan.sshFailed
            : `${t.ssh.exitStatus} ${run.exitStatus ?? '—'}`}
        </Pill>
        <span className="mono" style={{ fontSize: 9.5, color: 'var(--text3)' }}>
          {run.durationMs} ms
        </span>
        {run.truncated ? (
          <span style={{ fontSize: 10, color: palette.warn }}>{t.ssh.truncatedNote}</span>
        ) : null}
      </div>

      {run.error !== undefined ? (
        <div className="pretty" style={{ fontSize: 10.5, color: palette.bad, marginTop: 7 }}>
          {run.error}
        </div>
      ) : null}

      {run.executed && run.executed !== run.command ? (
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--text3)', marginTop: 7 }}>
          {t.ssh.executed}: {run.executed}
        </div>
      ) : null}

      {run.stdout ? <Stream text={run.stdout} color="var(--text)" /> : null}
      {run.stderr ? <Stream text={run.stderr} color={palette.warn} /> : null}
      {!run.stdout && !run.stderr && run.error === undefined ? (
        <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 7 }}>{t.ssh.noOutput}</div>
      ) : null}
    </div>
  );
}

function Stream({ text, color }: { text: string; color: string }) {
  return (
    <pre
      className="mono"
      style={{
        margin: '7px 0 0',
        padding: '8px 10px',
        maxHeight: 220,
        overflow: 'auto',
        background: 'var(--panel)',
        border: '1px solid var(--line)',
        borderRadius: 7,
        fontSize: 10,
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        color,
      }}
    >
      {text}
    </pre>
  );
}

function ChecklistBlock({
  title,
  items,
  color,
}: {
  title: string;
  items: string[];
  color: string;
}) {
  return (
    <div>
      <div className="sect" style={{ marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((item) => (
          <div key={item} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
            <span
              style={{
                width: 11,
                height: 11,
                flex: 'none',
                marginTop: 4,
                borderRadius: 3,
                border: `1px solid ${color}`,
              }}
            />
            <span
              className="pretty"
              style={{ fontSize: 11.5, color: 'var(--text2)', lineHeight: 1.5 }}
            >
              {item}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
