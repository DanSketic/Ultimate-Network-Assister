import { useState } from 'react';
import { effectiveLevel } from '@/blueprint/automation';
import { type AutomationLevel, type Plan, type PlanStep } from '@/blueprint/model';
import { useT } from '@/i18n';
import { vars } from '@/lib/css';
import type { Palette } from '@/lib/palette';
import type { CopyApi } from '@/state/useAppState';
import { Pill, StatCard } from '../ui';

const MODES: AutomationLevel[] = ['manual', 'assisted', 'auto'];

export function PlanTab({
  plan,
  palette,
  accent,
  copy,
}: {
  plan: Plan;
  palette: Palette;
  accent: string;
  copy: CopyApi;
}) {
  const t = useT();
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
                {step.actions.map((a, i) => {
                  const key = `${step.id}-${i}`;
                  return (
                    <div
                      key={key}
                      style={{
                        border: `1px solid ${a.destructive ? palette.bad : 'var(--line)'}`,
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
                        <span style={{ fontSize: 11, fontWeight: 500 }}>{a.label}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Pill color={a.destructive ? palette.bad : palette.idle} tight>
                            {a.kind === 'api'
                              ? t.plan.actionApi
                              : a.kind === 'command'
                                ? t.plan.actionCommand
                                : t.plan.actionUi}
                          </Pill>
                          <span className="mono" style={{ fontSize: 9.5, color: 'var(--text3)' }}>
                            {a.target}
                          </span>
                          <button
                            type="button"
                            className="link"
                            style={{ fontSize: 10 }}
                            onClick={() => copy.copy(a.body, key)}
                          >
                            {copy.label(key)}
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
                        {a.body}
                      </pre>
                    </div>
                  );
                })}
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
