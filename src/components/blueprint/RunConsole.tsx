import { useEffect, useMemo, useRef, useState } from 'react';
import { useProgress } from '@/state/useProgress';
import {
  isDestructiveCommand,
  isDisruptiveCommand,
  isTemplateCommand,
} from '@/blueprint/automation';
import type { Plan, PlanStep } from '@/blueprint/model';
import { useT } from '@/i18n';
import { cx, vars } from '@/lib/css';
import type { Palette } from '@/lib/palette';
import type { ApplyApi } from '@/state/useApply';
import { usePlanRunner } from '@/state/usePlanRunner';
import type { Profile } from '@/survey/model';
import { SectionLabel } from '../ui';
import { ApplyPanel } from './ApplyPanel';

/**
 * The run console.
 *
 * Everything this application can carry out itself, queued in the order the
 * plan puts it in, and run down that queue.
 *
 * It exists because the two surfaces had stopped meaning what their names
 * said. The plan explained the work and, once it could run a command, also did
 * some of it; apply wrote two kinds of UniFi object and nothing else. "Read"
 * and "do" was no longer the difference between them, and a reader had no way
 * to tell which of the two places a given piece of work happened in.
 *
 * So the split is by role instead. The plan is the handbook: the whole body of
 * work in order, with what each step is for, and a way to do any single one of
 * them there and then. This is the console: the subset the application can
 * carry out on its own — a controller write, a sequence of commands over SSH —
 * lined up, run in order, stopping at the first thing that fails.
 *
 * Two rules it keeps, because the whole point is that a queue does not make
 * anything easier to do by accident:
 *
 *   Order is the plan's order. A step whose prerequisites have not run is not
 *   offered ahead of them, and the queue does not reorder itself to keep busy.
 *
 *   Nothing runs that would not run one at a time. The same native policy
 *   decides each command, destructive storage work is not here at all, and a
 *   step that needs someone at the machine stays in the plan where it says so.
 */

type StepState = 'idle' | 'running' | 'done' | 'failed';

/** How a step gets carried out, when it can be. */
type Route = 'unifi' | 'ssh';

interface QueueItem {
  step: PlanStep;
  route: Route;
  /** The commands, with the key each action card uses, for an SSH step. */
  commands: { key: string; command: string }[];
  disruptive: boolean;
}

/** The commands of a step this application could actually send, in order. */
function commandsOf(step: PlanStep): { key: string; command: string }[] {
  return step.actions
    .map((action, i) => ({ action, key: `${step.id}-${i}` }))
    .filter(
      ({ action }) =>
        action.kind === 'command' &&
        !action.destructive &&
        !isTemplateCommand(action.body) &&
        !isDestructiveCommand(action.body),
    )
    .map(({ action, key }) => ({ key, command: action.body }));
}

function queueOf(plan: Plan): QueueItem[] {
  const out: QueueItem[] = [];
  for (const step of plan.steps) {
    if (step.capability !== 'auto') continue;

    // The applier's own two object kinds go through the apply machinery, which
    // has the backup and the dry run this console has no business repeating.
    if (step.actions.some((a) => a.kind === 'api' && a.writable)) {
      out.push({ step, route: 'unifi', commands: [], disruptive: false });
      continue;
    }

    // A step that can cut the session carrying it is not queue work: it is
    // done at the machine, and the plan says so on the step itself.
    if (step.requiresLocalConsole) continue;

    const commands = commandsOf(step);
    if (commands.length === 0) continue;
    out.push({
      step,
      route: 'ssh',
      commands,
      disruptive: commands.some((c) => isDisruptiveCommand(c.command)),
    });
  }
  return out;
}

export function RunConsole({
  blueprintId,
  plan,
  apply,
  profiles,
  palette,
  accent,
}: {
  /** Whose plan this is, for the ticks it shares with the plan tab. */
  blueprintId: string;
  plan: Plan;
  apply: ApplyApi;
  profiles: Profile[];
  palette: Palette;
  accent: string;
}) {
  const t = useT();
  const x = t.run;
  const runner = usePlanRunner(profiles);
  const progress = useProgress(blueprintId, plan.steps);

  const queue = useMemo(() => queueOf(plan), [plan]);
  const [state, setState] = useState<Record<string, StepState>>({});
  const [active, setActive] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const stop = useRef(false);

  // What ran in this sitting first; then the saved ticks, so a queue picked up
  // on another evening starts where the last one stopped.
  const stateOf = (id: string) => state[id] ?? (progress.done.has(id) ? 'done' : 'idle');
  const setStep = (id: string, value: StepState) =>
    setState((prev) => ({ ...prev, [id]: value }));
  const note = (line: string) => setLog((prev) => [...prev, line]);

  const sshCount = queue.filter((q) => q.route === 'ssh').length;
  const unifiCount = queue.filter((q) => q.route === 'unifi').length;
  const commandCount = queue.reduce((sum, q) => sum + q.commands.length, 0);
  const running = active !== null;

  /*
   * The steps this console cannot run, that something in it waits for.
   *
   * The trunk bridge is the case that matters: it has to exist before a guest
   * can be given a network card on it, and it is exactly the step that must be
   * done at the machine because reloading the bridge can drop the session. A
   * queue that ran `pct create` without it would build machines onto a bridge
   * that is not there — so it is listed here, and ticking it off is how
   * someone says they did it at the console.
   */
  // Ticked in the shared progress, so a tick made on the plan tab counts here.
  const byId = useMemo(() => new Map(plan.steps.map((s) => [s.id, s])), [plan]);
  const inQueue = useMemo(() => new Set(queue.map((q) => q.step.id)), [queue]);

  const outsideNeeds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of queue) {
      for (const id of item.step.requires) {
        if (!inQueue.has(id) && byId.has(id)) ids.add(id);
      }
    }
    return [...ids].map((id) => byId.get(id)!);
  }, [queue, inQueue, byId]);

  /** What is still in this one's way: earlier queue work, or a step done by hand. */
  const blockedBy = (item: QueueItem): string[] => {
    const at = queue.indexOf(item);
    const earlier = queue
      .slice(0, at)
      .filter((q) => stateOf(q.step.id) !== 'done')
      .map((q) => q.step.title);
    const byHand = item.step.requires
      .filter((id) => !inQueue.has(id) && byId.has(id) && !progress.done.has(id))
      .map((id) => byId.get(id)!.title);
    return [...byHand, ...earlier];
  };

  const blocked = (item: QueueItem) => blockedBy(item).length > 0;

  /*
   * The step being run is kept in the middle of its window.
   *
   * Scrolled rather than jumped, and centred rather than merely brought into
   * view: half the value of watching a queue is seeing what just finished
   * above the current one and what is coming below it. `scrollIntoView` would
   * do this in one line and also scroll the page behind it, which is exactly
   * what a window of its own is there to avoid — so the offset is set on the
   * list itself.
   */
  const listRef = useRef<HTMLDivElement | null>(null);
  const rows = useRef(new Map<string, HTMLElement>());
  useEffect(() => {
    const list = listRef.current;
    const row = active ? rows.current.get(active) : null;
    if (!list || !row) return;
    list.scrollTo({
      top: row.offsetTop - list.clientHeight / 2 + row.clientHeight / 2,
      behavior: 'smooth',
    });
  }, [active]);

  const runOne = async (item: QueueItem): Promise<boolean> => {
    setActive(item.step.id);
    setStep(item.step.id, 'running');
    try {
      if (item.route === 'unifi') {
        /*
         * The controller's own path, unchanged.
         *
         * Backup and dry run first, then exactly what was shown — the same
         * two calls the apply panel makes, so there is one way of writing a
         * network and not two.
         */
        await apply.prepare();
        await apply.applyShown();
        const failed = apply.error !== null;
        setStep(item.step.id, failed ? 'failed' : 'done');
        if (!failed) progress.mark(item.step, 'applied');
        note(`${failed ? '✕' : '✓'} ${item.step.title}`);
        return !failed;
      }

      const ok = await runner.runSequence(item.commands);
      setStep(item.step.id, ok ? 'done' : 'failed');
      if (ok) progress.mark(item.step, 'ran');
      note(`${ok ? '✓' : '✕'} ${item.step.title}`);
      return ok;
    } finally {
      setActive(null);
    }
  };

  const runAll = async () => {
    stop.current = false;
    for (const item of queue) {
      if (stop.current) {
        note(x.stopped);
        return;
      }
      if (stateOf(item.step.id) === 'done') continue;
      // A queue does not get to skip what it is waiting for.
      const waiting = blockedBy(item);
      if (waiting.length > 0) {
        note(x.haltedWaiting(item.step.title, waiting[0] ?? ''));
        return;
      }
      const ok = await runOne(item);
      if (!ok) {
        note(x.haltedHere(item.step.title));
        return;
      }
    }
    note(x.finished);
  };

  if (!runner.supported) {
    return (
      <div className="panel" style={{ padding: '18px 20px', maxWidth: 680 }}>
        <div className="pretty" style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
          {t.apply.desktopOnly}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1000 }}>
      <div>
        <SectionLabel>{x.title}</SectionLabel>
        <div
          className="pretty"
          style={{ fontSize: 11.5, color: 'var(--text2)', lineHeight: 1.6, margin: '6px 0 12px' }}
        >
          {x.subtitle}
        </div>

        <div className="panel" style={{ padding: '13px 15px' }}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12 }}>
              {x.summary(queue.length, unifiCount, sshCount, commandCount)}
            </span>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              className="btn-primary"
              disabled={running || queue.length === 0 || !runner.ready}
              style={vars({ '--btn-bg': accent })}
              onClick={() => void runAll()}
            >
              {running ? x.running : x.runAll}
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={!running}
              onClick={() => {
                stop.current = true;
              }}
            >
              {x.stop}
            </button>
          </div>

          {/* Which machine the commands go to. Without one, nothing here runs. */}
          <div
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              flexWrap: 'wrap',
              marginTop: 12,
              paddingTop: 12,
              borderTop: '1px solid var(--line)',
            }}
          >
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--text3)' }}>
              {t.plan.sshTarget}
            </span>
            {runner.profiles.length > 0 ? (
              <select
                className="input"
                style={{ fontSize: 11, maxWidth: 320 }}
                value={runner.selected?.id ?? ''}
                onChange={(e) => runner.select(e.target.value)}
              >
                {runner.profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} · {p.sshUsername}@{p.sshHost}
                  </option>
                ))}
              </select>
            ) : (
              <span style={{ fontSize: 11, color: palette.warn }}>{t.plan.sshNoProfiles}</span>
            )}
          </div>
        </div>
      </div>

      {/*
        * What the queue waits for and cannot do itself.
        *
        * Shown above it rather than mixed into it: these are not queue work,
        * they are the reason some of the queue is not ready yet.
        */}
      {outsideNeeds.length > 0 ? (
        <div className="soft" style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>{x.byHandTitle}</div>
          <div
            className="pretty"
            style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.55, marginBottom: 8 }}
          >
            {x.byHandNote}
          </div>
          {outsideNeeds.map((step) => (
            <label
              key={step.id}
              style={{
                display: 'flex',
                gap: 9,
                alignItems: 'center',
                fontSize: 11.5,
                cursor: 'pointer',
                padding: '3px 0',
              }}
            >
              <input
                type="checkbox"
                checked={progress.done.has(step.id)}
                onChange={(e) =>
                  e.target.checked ? progress.mark(step, 'manual') : progress.unmark(step)
                }
              />
              <span>{step.title}</span>
            </label>
          ))}
        </div>
      ) : null}

      {/* The queue itself, in the plan's order, scrolling in its own window. */}
      <div className="run-queue" ref={listRef}>
        {queue.map((item, i) => {
          const status = stateOf(item.step.id);
          const tone =
            status === 'done'
              ? palette.ok
              : status === 'failed'
                ? palette.bad
                : status === 'running'
                  ? accent
                  : palette.idle;
          return (
            <div
              key={item.step.id}
              ref={(el) => {
                if (el) rows.current.set(item.step.id, el);
                else rows.current.delete(item.step.id);
              }}
              className={cx('port-row')}
              style={vars({ '--tone': tone })}
            >
              <span className="port-row__num">{i + 1}</span>
              <div style={{ minWidth: 0 }}>
                <div className="port-row__what">{item.step.title}</div>
                <div className="fact-chips">
                  <span className="fact-chip fact-chip--flag mono" style={vars({ '--tone': tone })}>
                    {x.state[status]}
                  </span>
                  <span className="fact-chip">
                    <span className="fact-chip__k">{x.route}</span>
                    <span className="fact-chip__v">
                      {item.route === 'unifi' ? x.routeUnifi : x.routeSsh}
                    </span>
                  </span>
                  {item.commands.length > 0 ? (
                    <span className="fact-chip">
                      <span className="fact-chip__k">{x.commands}</span>
                      <span className="fact-chip__v">{item.commands.length}</span>
                    </span>
                  ) : null}
                  {item.disruptive ? (
                    <span
                      className="fact-chip fact-chip--flag mono"
                      style={vars({ '--tone': palette.warn })}
                    >
                      {t.plan.mayInterrupt}
                    </span>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                className="btn-ghost"
                style={{ fontSize: 10.5, padding: '4px 9px' }}
                disabled={running || !runner.ready || blocked(item)}
                title={blockedBy(item).join(' · ') || undefined}
                onClick={() => void runOne(item)}
              >
                {x.runThis}
              </button>
            </div>
          );
        })}
        {queue.length === 0 ? (
          <div className="soft" style={{ padding: '14px 16px', fontSize: 11.5, color: 'var(--text2)' }}>
            {x.empty}
          </div>
        ) : null}
      </div>

      {log.length > 0 ? (
        <div>
          <SectionLabel style={{ marginBottom: 8 }}>{x.logTitle}</SectionLabel>
          <pre
            className="mono soft"
            style={{
              margin: 0,
              padding: '11px 13px',
              fontSize: 10.5,
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
            }}
          >
            {log.join('\n')}
          </pre>
        </div>
      ) : null}

      {/*
        * The controller's own panel, whole.
        *
        * Its backup, its dry run against the live site and its rollback are
        * the reason a network write is worth reviewing as a set rather than
        * one object at a time — so the queue calls into it rather than
        * reimplementing any of it, and it stays here to be read.
        */}
      {unifiCount > 0 ? (
        <div>
          <SectionLabel style={{ marginBottom: 8 }}>{x.controllerTitle}</SectionLabel>
          <ApplyPanel api={apply} palette={palette} />
        </div>
      ) : null}
    </div>
  );
}
