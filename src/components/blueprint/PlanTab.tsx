import { useEffect, useState } from 'react';
import {
  effectiveLevel,
  isDestructiveCommand,
  isDisruptiveCommand,
  isTemplateCommand,
} from '@/blueprint/automation';
import {
  type AutomationLevel,
  type Plan,
  type PlanAction,
  type PlanStep,
  type TargetPlatform,
} from '@/blueprint/model';
import { useI18n, useT } from '@/i18n';
import { vars } from '@/lib/css';
import type { Palette } from '@/lib/palette';
import type { CopyApi } from '@/state/useAppState';
import { usePlanRunner, type PlanRun, type PlanRunnerApi } from '@/state/usePlanRunner';
import { useProgress, type StepStatus } from '@/state/useProgress';
import type { Clearance, Profile } from '@/survey/model';
import { Pill, StatCard } from '../ui';

const MODES: AutomationLevel[] = ['manual', 'assisted', 'auto'];

/**
 * Which system a step is against.
 *
 * A step's actions all land on one machine in practice; where they do not, the
 * first one decides, because that is the system the step is about. Steps with
 * no actions are the estate's own paperwork and go under the host.
 */
function targetOf(step: PlanStep): TargetPlatform {
  return step.actions[0]?.target ?? 'host';
}

/** The commands of a step this application could actually send, in order. */
function runnableCommands(step: PlanStep): PlanAction[] {
  return step.actions.filter(
    (a) =>
      a.kind === 'command' &&
      !a.destructive &&
      !isTemplateCommand(a.body) &&
      !isDestructiveCommand(a.body),
  );
}

const CLEARANCE_TONE: Record<Clearance, 'ok' | 'warn' | 'bad'> = {
  readOnly: 'ok',
  mutating: 'warn',
  forbidden: 'bad',
};

export function PlanTab({
  blueprintId,
  plan,
  profiles,
  palette,
  accent,
  copy,
}: {
  /** Whose plan this is, for the saved ticks. */
  blueprintId: string;
  plan: Plan;
  profiles: Profile[];
  palette: Palette;
  accent: string;
  copy: CopyApi;
}) {
  const t = useT();
  const runner = usePlanRunner(profiles);
  /*
   * A mode per system, not one for the estate.
   *
   * The two halves are not the same kind of risk and are rarely at the same
   * stage. A controller that is already carrying households wants every write
   * read first; a Proxmox host being built from nothing wants the sequence run
   * and the output read after. One setting for both meant picking the more
   * cautious of the two and then clicking through the other by hand.
   */
  const [modes, setModes] = useState<Record<TargetPlatform, AutomationLevel>>({
    unifi: 'assisted',
    proxmox: 'assisted',
    docker: 'assisted',
    kubernetes: 'assisted',
    host: 'assisted',
  });
  const modeOf = (step: PlanStep) => modes[targetOf(step)];
  const [open, setOpen] = useState<string | null>(plan.steps[0]?.id ?? null);

  const modeHint: Record<AutomationLevel, string> = {
    manual: t.plan.modeManual,
    assisted: t.plan.modeAssisted,
    auto: t.plan.modeAuto,
  };

  // Only the systems this plan actually touches get a switch.
  const targets = [...new Set(plan.steps.map(targetOf))];

  /*
   * Which steps are behind us.
   *
   * The plan is in order, and until the application could run a step there was
   * nothing to enforce: a person reading step 31 has read 30. Running one is
   * different — `pct create` against a pool that does not exist fails, and the
   * failure is the first anybody hears of the order.
   *
   * A step counts as done when its sequence ran here without a failure, or
   * when the operator says so — because most of this plan is still carried out
   * by hand, and a plan that only believes its own runs would block the whole
   * estate behind a step somebody did at the console an hour ago.
   *
   * Saved, and said how. It used to be held for the session only, on the
   * grounds that a tick in a file is a claim about a machine nobody has
   * looked at since — which is why a saved tick carries how and when it was
   * made, is shown with both, and stops counting the moment the step changes.
   * A plan worked through over several evenings otherwise lost its place every
   * time the window closed. See `blueprint/progress.ts`.
   */
  const progress = useProgress(blueprintId, plan.steps);
  const done = progress.done;

  const byId = new Map(plan.steps.map((step) => [step.id, step]));
  const stepTitles = new Map(plan.steps.map((step) => [step.id, step.title]));
  /** The prerequisites of a step that are still outstanding, by title. */
  const missingBefore = (step: PlanStep) =>
    step.requires
      .filter((id) => !done.has(id))
      .map((id) => byId.get(id)?.title ?? id);

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

      {/*
        * The mode panel stays put.
        *
        * It is the control the rest of the page is read against — every step's
        * badge means something different depending on it — and the plan is
        * forty steps long. Scrolled off the top, the reader is looking at
        * "automata" on a step with no way to see, or change, what that is set
        * to without going back up.
        */}
      <div
        style={{
          position: 'sticky',
          /*
           * Minus the view's own top padding, because that is what the sticky
           * offset is measured from: at `0` the panel parks one padding's
           * worth down the page, and the steps scroll through the strip above
           * it. The number is the same one the negative margin undoes.
           */
          top: -18,
          zIndex: 5,
          /*
           * Out to the scroller's own edges, and back in again.
           *
           * The view is padded, and a sticky element inside it sticks to the
           * padding box — which leaves a band above it where the steps scroll
           * past in plain sight. The negative margin takes this wrapper out to
           * the container's edge so it covers that band, and its padding puts
           * the panel back where the eye expects it.
           */
          margin: '-18px -20px 20px',
          padding: '18px 20px 0',
          background: 'var(--app)',
        }}
      >
      <div
        className="panel"
        style={{
          padding: '13px 15px',
          boxShadow: '0 6px 18px -12px rgba(0,0,0,.55)',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 500 }}>{t.plan.executionMode}</span>
        {targets.map((target) => (
          <div
            key={target}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
              marginTop: 10,
            }}
          >
            <span
              className="mono"
              style={{ fontSize: 10.5, color: 'var(--text3)', minWidth: 96 }}
            >
              {t.blueprint.targets[target]}
            </span>
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
                  aria-pressed={modes[target] === m}
                  style={vars({
                    '--tab-bg': modes[target] === m ? 'var(--panel)' : 'transparent',
                    '--tab-fg': modes[target] === m ? 'var(--text)' : 'var(--text2)',
                  })}
                  onClick={() => setModes((prev) => ({ ...prev, [target]: m }))}
                >
                  {t.blueprint.automation[m]}
                </button>
              ))}
            </div>
            <span
              className="pretty"
              style={{ fontSize: 10.5, color: 'var(--text2)', flex: 1, minWidth: 220 }}
            >
              {modeHint[modes[target]]}
            </span>
          </div>
        ))}

        {/* Where the whole queue is run, said once, where the modes are set. */}
        <div
          className="pretty"
          style={{ fontSize: 10.5, color: 'var(--text3)', lineHeight: 1.55, marginTop: 10 }}
        >
          {t.plan.whereTheQueueIs}
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
                effective={effectiveLevel(modeOf(step), step.capability)}
                blockedBy={missingBefore(step)}
                stepTitles={stepTitles}
                done={done.has(step.id)}
                status={progress.statusOf(step)}
                onDone={(yes) => (yes ? progress.mark(step, 'manual') : progress.unmark(step))}
                onRan={() => progress.mark(step, 'ran')}
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
  blockedBy,
  stepTitles,
  done,
  status,
  onDone,
  onRan,
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
  /** Prerequisites still outstanding, by title. Empty when the way is clear. */
  blockedBy: string[];
  /** Every step's title, for naming the ones this one waits on. */
  stepTitles: Map<string, string>;
  done: boolean;
  /** The saved tick, when there is one — including one that no longer counts. */
  status: StepStatus | null;
  onDone: (yes: boolean) => void;
  /** The step's sequence ran here to the end without a failure. */
  onRan: () => void;
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
            {done ? (
              <Pill color={palette.ok} tight>
                {t.plan.stepDone}
              </Pill>
            ) : status?.stale ? (
              <Pill color={palette.warn} tight>
                {t.plan.stepChanged}
              </Pill>
            ) : null}
            {blockedBy.length > 0 ? (
              <Pill color={palette.warn} tight>
                {t.plan.stepBlocked(blockedBy.length)}
              </Pill>
            ) : null}
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
        <div style={{ padding: '0 14px 14px 45px' }}>
          <StepBody
            step={step}
            effective={effective}
            blockedBy={blockedBy}
            stepTitles={stepTitles}
            done={done}
            status={status}
            onDone={onDone}
            onRan={onRan}
            palette={palette}
            accent={accent}
            copy={copy}
            runner={runner}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Everything a step asks of somebody, and the means to do it.
 *
 * Shared by the plan and the guided path, so a step reads the same and runs
 * under the same rules wherever it is opened. What the guided path leaves out
 * is the chrome around it — the numbering and the pills — never any of this.
 */
export function StepBody({
  step,
  effective,
  blockedBy,
  stepTitles,
  done,
  status,
  onDone,
  onRan,
  palette,
  accent,
  copy,
  runner,
  showDoneTick = true,
}: {
  step: PlanStep;
  effective: AutomationLevel;
  blockedBy: string[];
  stepTitles: Map<string, string>;
  done: boolean;
  status: StepStatus | null;
  onDone: (yes: boolean) => void;
  onRan: () => void;
  palette: Palette;
  accent: string;
  copy: CopyApi;
  runner: PlanRunnerApi;
  /** Off where the caller offers its own, larger way of saying "done". */
  showDoneTick?: boolean;
}) {
  const t = useT();

  /*
   * The whole step, run in one go.
   *
   * Offered only where the mode says `auto` and the step is made of commands
   * this application can send. The approval is the same act as approving one
   * command, moved up a level: the operator reads the sequence, sees what in it
   * can interrupt something, and says yes once. Everything below it is
   * unchanged — the native policy still decides each command on the way out.
   */
  const sequence = step.actions
    .map((action, i) => ({ action, key: `${step.id}-${i}` }))
    .filter(({ action }) => runnableCommands(step).includes(action));
  const disruptive = sequence.filter(({ action }) => isDisruptiveCommand(action.body));
  /*
   * Not for a step that needs someone at the machine.
   *
   * A step marked `requiresLocalConsole` is one where the command can cut the
   * session carrying it — reloading the bridge the SSH connection runs over is
   * the case it was written for. The single-command path already refuses to
   * send those; running them as a sequence would be the same act with less
   * ceremony, which is the wrong direction.
   */
  const offersSequence =
    effective === 'auto' && runner.ready && sequence.length > 0 && !step.requiresLocalConsole;
  const blocked = blockedBy.length > 0;
  const sequenceBusy = runner.runningSequence(sequence.map((x) => x.key));
  const [sequenceApproved, setSequenceApproved] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/*
        * The order, stated rather than implied.
        *
        * A plan is a sequence, and the only thing that used to hold it in
        * order was the reader going down the page. Naming what a step is
        * waiting for turns "it failed" into "not yet" — and the tick is
        * how a step done at the console an hour ago stops blocking the
        * rest of the estate.
        */}
      {step.requires.length > 0 ? (
        <div
          className="soft"
          style={{
            padding: '10px 12px',
            borderColor: blockedBy.length > 0 ? palette.warn : 'var(--line)',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 5 }}>
            {blockedBy.length > 0 ? t.plan.waitsFor : t.plan.orderClear}
          </div>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 11,
              color: 'var(--text2)',
              lineHeight: 1.6,
            }}
          >
            {step.requires.map((id) => (
              <li key={id} style={{ color: blockedBy.length > 0 ? undefined : palette.ok }}>
                {stepTitles.get(id) ?? id}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {step.prechecks.length > 0 ? (
        <ChecklistBlock title={t.plan.precheck} items={step.prechecks} color={palette.warn} />
      ) : null}

      {/*
        * Running the step as one act.
        *
        * The list below it does not change: every command is still shown
        * in full, still copyable, still runnable on its own. This is the
        * `auto` mode's whole difference — one reading, one approval, and
        * the sequence stops itself at the first command that fails.
        */}
      {offersSequence ? (
        <div className="soft" style={{ padding: '11px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 500 }}>
              {t.plan.runStepTitle(sequence.length)}
            </span>
            {disruptive.length > 0 ? (
              <Pill color={palette.warn} tight>
                {t.plan.mayInterrupt}
              </Pill>
            ) : null}
          </div>
          <div
            className="pretty"
            style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.55, marginTop: 6 }}
          >
            {blocked
              ? t.plan.orderBlockedNote
              : disruptive.length > 0
                ? t.plan.runStepInterruptNote
                : t.plan.runStepNote}
          </div>
          {disruptive.length > 0 ? (
            <ul
              className="mono"
              style={{ margin: '7px 0 0', paddingLeft: 18, fontSize: 10, color: palette.warn }}
            >
              {disruptive.map(({ key, action }) => (
                <li key={key}>{action.label}</li>
              ))}
            </ul>
          ) : null}
          <label
            style={{
              display: 'flex',
              gap: 9,
              alignItems: 'flex-start',
              margin: '10px 0',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={sequenceApproved}
              disabled={blocked}
              onChange={(e) => setSequenceApproved(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span className="pretty">{t.plan.runStepConfirm(sequence.length)}</span>
          </label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-primary"
              disabled={!sequenceApproved || sequenceBusy || blocked}
              style={vars({ '--btn-bg': accent })}
              onClick={() => {
                setSequenceApproved(false);
                void runner
                  .runSequence(sequence.map(({ key, action }) => ({ key, command: action.body })))
                  // Behind us only when every command of it ran and none
                  // failed. This used to tick the step whatever came back,
                  // so a sequence that stopped at its second command
                  // counted as done and unblocked everything after it.
                  .then((ok) => {
                    if (ok) onRan();
                  });
              }}
            >
              {sequenceBusy ? t.ssh.runningNow : t.plan.runStep}
            </button>
            <span className="mono" style={{ fontSize: 9.5, color: 'var(--text3)' }}>
              {runner.selected?.label} · {runner.selected?.sshHost}
            </span>
          </div>
        </div>
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

      {showDoneTick ? (
        <label
          style={{
            display: 'flex',
            gap: 9,
            alignItems: 'center',
            fontSize: 11,
            cursor: 'pointer',
            color: 'var(--text2)',
          }}
        >
          <input type="checkbox" checked={done} onChange={(e) => onDone(e.target.checked)} />
          <span className="pretty">{t.plan.markDone}</span>
        </label>
      ) : null}
      {status ? <MarkNote step={step} status={status} palette={palette} /> : null}

      {step.verification.length > 0 ? (
        <ChecklistBlock title={t.plan.verification} items={step.verification} color={accent} />
      ) : null}
    </div>
  );
}

/**
 * How a saved tick came about, and when.
 *
 * The honest half of keeping ticks across restarts: "done" alone would be a
 * claim about a machine nobody has looked at since, so the tick says whether
 * it was run here, written by the applier, found in place, or ticked by hand —
 * and a tick from an earlier sitting says so, next to the reading commands
 * that would show whether it is still true.
 */
export function MarkNote({
  step,
  status,
  palette,
}: {
  step: PlanStep;
  status: StepStatus;
  palette: Palette;
}) {
  const { lang, t } = useI18n();
  const when = new Date(status.mark.at).toLocaleString(lang, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const reads = step.actions.some((a) => a.kind === 'command');
  return (
    <div
      className="pretty"
      style={{
        fontSize: 10.5,
        lineHeight: 1.55,
        color: status.stale ? palette.warn : 'var(--text3)',
      }}
    >
      {t.plan.markHow[status.mark.how](when)}
      {status.stale ? ` ${t.plan.markStale}` : status.earlier && reads ? ` ${t.plan.markEarlier}` : ''}
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
