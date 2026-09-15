import { useEffect, useMemo, useState } from 'react';
import type { DryRunReport } from '@/apply/model';
import { effectiveLevel } from '@/blueprint/automation';
import {
  blueprintFromAnswers,
  defaultAnswers,
  editedSinceAnswered,
  guidedBlueprint,
  HOST_PRESET,
  presetIdFor,
  servicesFor,
  surveyFacts,
} from '@/blueprint/interview';
import type {
  Blueprint,
  InterviewAnswers,
  InterviewRemote,
  InterviewServer,
  Plan,
  PlanStep,
  ResolvedBlueprint,
} from '@/blueprint/model';
import type { ViewId } from '@/config';
import { useI18n, useT } from '@/i18n';
import { tint, type Palette } from '@/lib/palette';
import { vars } from '@/lib/css';
import type { CopyApi } from '@/state/useAppState';
import { useApply, type ApplyApi } from '@/state/useApply';
import type { BlueprintApi } from '@/state/useBlueprints';
import type { EstateApi } from '@/state/useEstate';
import { usePlanRunner } from '@/state/usePlanRunner';
import { useProgress, type ProgressApi } from '@/state/useProgress';
import type { EndpointProbe, HostKeyProbe, Profile } from '@/survey/model';
import { StepBody } from '../blueprint/PlanTab';
import { Meter, Pill, ViewHeading } from '../ui';

/*
 * The guided path.
 *
 * Everything else in this application is an instrument panel, and instruments
 * assume somebody who knows what reading they are looking for. That is the
 * right shape for the person who came here on purpose, and the wrong one for
 * the person who has a network, a suspicion that it could be better, and no
 * vocabulary for VLANs or zones or dry runs. For them the question is not
 * "which view" but "what now".
 *
 * The first version answered it for the network only, and with a plan nobody
 * had asked for: it wrote whichever blueprint happened to be open — out of the
 * box, the handbook's own three-household estate — and stopped once the
 * controller had its networks. Somebody who knows their equipment but not the
 * setup was left with the two things they could not do on their own: saying
 * what they want in words the planner understands, and working through the
 * forty steps that follow the network.
 *
 * So the path is five steps now. Connect and look, as before. Then a handful
 * of questions about the house — who shares it, what is in it, what the server
 * is for — that build the blueprint, with what the survey measured filled in
 * rather than asked. Then the network, written the way it always was. Then the
 * rest of the plan, one step at a time, each saying who does it and where,
 * with the ticks kept across evenings.
 *
 * What it still does not do is decide for you at the end of any of them. The
 * backup and the dry run happen on their own, because nobody who needs this
 * screen knows to ask for them; every change waits behind a sentence saying
 * what it is about to do.
 */

type Step = 'connect' | 'look' | 'want' | 'network' | 'steps';
const ORDER: Step[] = ['connect', 'look', 'want', 'network', 'steps'];

/** The object kinds the applier writes whose plan steps it can therefore settle. */
const WRITTEN = new Set(['unifi.network', 'unifi.portconf']);

/** A step made only of what the applier writes: networks and port profiles. */
function writtenByApplier(step: PlanStep): boolean {
  return step.actions.length > 0 && step.actions.every((a) => a.kind === 'api' && a.writable);
}

/** The counts a person cares about, in a sentence rather than a table. */
function summarise(report: DryRunReport, t: ReturnType<typeof useT>): string[] {
  const lines: string[] = [];
  if (report.counts.create > 0) lines.push(t.guided.willCreate(report.counts.create));
  if (report.counts.update > 0) lines.push(t.guided.willUpdate(report.counts.update));
  if (report.counts.noop > 0) lines.push(t.guided.alreadyRight(report.counts.noop));
  if (report.counts.external > 0) lines.push(t.guided.elsewhere(report.counts.external));
  if (report.counts.conflict > 0) lines.push(t.guided.refused(report.counts.conflict));
  return lines;
}

function useHours() {
  const { lang } = useI18n();
  return (minutes: number) =>
    (Math.round((minutes / 60) * 10) / 10).toLocaleString(lang, { maximumFractionDigits: 1 });
}

export function GuidedView({
  estate,
  blueprints,
  palette,
  accent,
  copy,
  goTo,
}: {
  estate: EstateApi;
  blueprints: BlueprintApi;
  palette: Palette;
  accent: string;
  copy: CopyApi;
  goTo: (view: ViewId) => void;
}) {
  const guided = guidedBlueprint(blueprints.blueprints);
  const { select, current } = blueprints;

  /*
   * The guided plan is the open one.
   *
   * So that "show me the detail" opens the same plan in the planner, and so
   * that the write path below is bound to it rather than to whatever the
   * planner last had open.
   */
  useEffect(() => {
    if (guided && current?.id !== guided.id) select(guided.id);
  }, [guided, current?.id, select]);

  // Before the store has loaded, or for the moment it takes the selection
  // above to land, there is nothing honest to show.
  if (!blueprints.resolved || !blueprints.plan || (guided && current?.id !== guided.id)) {
    return null;
  }

  return (
    <GuidedFlow
      estate={estate}
      blueprints={blueprints}
      guided={guided}
      resolved={blueprints.resolved}
      plan={blueprints.plan}
      palette={palette}
      accent={accent}
      copy={copy}
      goTo={goTo}
    />
  );
}

function GuidedFlow({
  estate,
  blueprints,
  guided,
  resolved,
  plan,
  palette,
  accent,
  copy,
  goTo,
}: {
  estate: EstateApi;
  blueprints: BlueprintApi;
  guided: Blueprint | undefined;
  resolved: ResolvedBlueprint;
  plan: Plan;
  palette: Palette;
  accent: string;
  copy: CopyApi;
  goTo: (view: ViewId) => void;
}) {
  const t = useT();
  const apply = useApply({ resolved, snapshot: estate.snapshot, profiles: estate.profiles });
  // One copy of the ticks for the whole path: the network step settles steps
  // the walk then reads, and two copies would disagree until a remount.
  const progress = useProgress(guided?.id, plan.steps);
  const [editing, setEditing] = useState(false);
  const [continued, setContinued] = useState(false);
  const [networkSeen, setNetworkSeen] = useState(false);

  const preview = !estate.supported;
  const surveyable = estate.profiles.filter((p) => p.fingerprint).map((p) => p.id);
  const written = useMemo(() => plan.steps.filter(writtenByApplier), [plan]);

  /*
   * Whether the network still wants writing.
   *
   * Settled for good by the saved ticks the applier leaves behind — so a
   * second evening does not start with another backup and dry run — and held
   * open for the rest of this sitting once it has been shown, so the outcome
   * and the undo stay on screen until somebody moves on.
   */
  const networkOpen =
    !!guided &&
    !preview &&
    written.length > 0 &&
    apply.targets.length > 0 &&
    (written.some((s) => !progress.done.has(s.id)) || (networkSeen && !continued));

  let step: Step;
  if (preview) step = guided && !editing ? 'steps' : 'want';
  else if (surveyable.length === 0) step = 'connect';
  else if (estate.mode !== 'survey' || !estate.snapshot) step = 'look';
  else if (!guided || editing) step = 'want';
  else if (networkOpen && !continued) step = 'network';
  else step = 'steps';

  useEffect(() => {
    if (step === 'network') setNetworkSeen(true);
  }, [step]);

  const busy = estate.running || apply.busy !== null;

  /*
   * The one place this takes an action nobody pressed.
   *
   * A backup and a dry run change nothing and are needed before anything can be
   * shown, so making the user ask for them is asking them to know they exist.
   * Only once per arrival: a failure is shown, not retried in a loop.
   */
  useEffect(() => {
    if (step === 'network' && !busy && !apply.report && !apply.error && !apply.run) {
      void apply.prepare();
    }
  }, [step, busy, apply]);

  /*
   * What the applier settles, it ticks — and says how.
   *
   * A dry run that finds nothing to create or change for the networks and port
   * profiles is a measurement that they are in place; a run that wrote them
   * without a failure is a record that they were put there. Nothing else is
   * ticked on anybody's behalf.
   */
  const { mark, done } = progress;
  useEffect(() => {
    const report = apply.report;
    if (!report) return;
    const outstanding = report.diffs.some(
      (d) => WRITTEN.has(d.operation.kind) && d.verdict !== 'noop' && d.verdict !== 'external',
    );
    if (outstanding) return;
    for (const s of written) if (!done.has(s.id)) mark(s, 'verified');
  }, [apply.report, written, done, mark]);

  useEffect(() => {
    const run = apply.run;
    if (!run || run.abortedReason) return;
    if (run.entries.some((e) => WRITTEN.has(e.kind) && e.outcome === 'failed')) return;
    for (const s of written) if (!done.has(s.id)) mark(s, 'applied');
  }, [apply.run, written, done, mark]);

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px 28px' }}>
      <ViewHeading title={t.guided.title} subtitle={t.guided.subtitle} />

      {preview ? (
        <Card>
          <Lead>{t.guided.desktopOnly}</Lead>
        </Card>
      ) : null}

      <Steps step={step} preview={preview} palette={palette} accent={accent} />

      {step === 'connect' ? (
        <ConnectCard estate={estate} palette={palette} accent={accent} goTo={goTo} />
      ) : null}

      {step === 'look' ? (
        <Card>
          <Title>{t.guided.lookTitle}</Title>
          <Lead>{t.guided.lookBody}</Lead>
          <Actions>
            <button
              type="button"
              className="btn-primary"
              disabled={busy || surveyable.length === 0}
              style={vars({ '--btn-bg': accent })}
              onClick={() => void estate.run(surveyable)}
            >
              {estate.running ? t.guided.looking : t.guided.lookAction}
            </button>
          </Actions>
        </Card>
      ) : null}

      {step === 'want' ? (
        <WantCard
          estate={estate}
          blueprints={blueprints}
          guided={guided}
          preview={preview}
          palette={palette}
          accent={accent}
          onSaved={() => setEditing(false)}
          onCancel={guided && editing ? () => setEditing(false) : undefined}
        />
      ) : null}

      {step === 'network' ? (
        <NetworkCard
          apply={apply}
          busy={busy}
          palette={palette}
          accent={accent}
          goTo={goTo}
          onContinue={() => setContinued(true)}
        />
      ) : null}

      {step === 'steps' && guided ? (
        <Walk
          plan={plan}
          progress={progress}
          estate={estate}
          surveyable={surveyable}
          palette={palette}
          accent={accent}
          copy={copy}
          goTo={goTo}
          onEditAnswers={() => setEditing(true)}
        />
      ) : null}

      {apply.error || estate.error ? (
        <Card>
          <div className="pretty" style={{ fontSize: 12, color: palette.bad, lineHeight: 1.6 }}>
            {apply.error ?? estate.error}
          </div>
        </Card>
      ) : null}

      <div
        className="pretty"
        style={{ fontSize: 11, color: 'var(--text3)', marginTop: 18, lineHeight: 1.6, maxWidth: 640 }}
      >
        {t.guided.footnote}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- want */

/**
 * The questions, and beside them what the answers turn into.
 *
 * The preview is the blueprint that will be saved, resolved and planned on
 * every change — not a description of it — so what somebody agrees to is
 * exactly what they get. The answers are about the house; the networks, the
 * machines and the size of the job are shown as consequences, in the preset's
 * own plain purposes, for the reader who wants to see them and can ignore them
 * otherwise.
 */
function WantCard({
  estate,
  blueprints,
  guided,
  preview,
  palette,
  accent,
  onSaved,
  onCancel,
}: {
  estate: EstateApi;
  blueprints: BlueprintApi;
  guided: Blueprint | undefined;
  preview: boolean;
  palette: Palette;
  accent: string;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const x = t.guided.want;
  const hours = useHours();

  const facts = useMemo(
    () => surveyFacts(estate.snapshot, estate.profiles),
    [estate.snapshot, estate.profiles],
  );
  const presetId = presetIdFor(facts);
  const hostOnly = presetId === HOST_PRESET;

  const [answers, setAnswers] = useState<InterviewAnswers>(() => {
    const kept = guided?.interview?.answers;
    if (kept) return kept;
    const fresh = defaultAnswers(facts, t);
    // A server-only estate has a server by definition; the question left is
    // whether it is in use yet.
    return hostOnly && fresh.server === 'none' ? { ...fresh, server: 'existing' } : fresh;
  });
  const set = (patch: Partial<InterviewAnswers>) => setAnswers((a) => ({ ...a, ...patch }));
  // Networks picked for single ports: part of the plan, not of the answers,
  // so they travel in the ports rather than in the interview record.
  const [portNetworks, setPortNetworks] = useState<Record<string, number>>({});

  const result = useMemo(
    () =>
      blueprintFromAnswers({
        answers,
        facts,
        presets: blueprints.presets,
        snapshot: estate.snapshot,
        t,
        ...(guided ? { base: guided } : {}),
        portNetworks,
      }),
    [answers, facts, blueprints.presets, estate.snapshot, t, guided, portNetworks],
  );

  const errors = result?.resolved.issues.filter((i) => i.severity === 'error') ?? [];

  /*
   * The ports worth asking about: the ones on no planned network, the ones
   * placed on the home network on the household's behalf, and the ones already
   * answered — kept in the list once answered, so a row does not vanish from
   * under the pointer the moment it is set.
   */
  const askedIds = new Set([
    ...(result?.orphans ?? []).map((p) => p.id),
    ...(result?.placed ?? []).map((p) => p.id),
    ...Object.keys(portNetworks),
  ]);
  const asked = (result?.blueprint.ports ?? []).filter((p) => askedIds.has(p.id));
  const offered = servicesFor(presetId);
  const adoptable =
    !guided && blueprints.current && !blueprints.current.interview && blueprints.current.source === 'user'
      ? blueprints.current
      : undefined;

  const homeNames =
    answers.homeNames.length >= 2
      ? answers.homeNames
      : [...answers.homeNames, x.homeNumbered(1), x.homeNumbered(2)].slice(0, 2);

  const save = () => {
    if (!result || errors.length > 0) return;
    blueprints.upsert(result.blueprint);
    onSaved();
  };

  const adopt = () => {
    if (!adoptable) return;
    const stamp = new Date().toISOString();
    blueprints.upsert({
      ...adoptable,
      interview: { answers: null, answeredAt: stamp },
      updatedAt: stamp,
    });
    onSaved();
  };

  const serverChoices: { value: InterviewServer; label: string; hint: string }[] = [
    ...(hostOnly ? [] : [{ value: 'none' as const, label: x.serverNone, hint: x.serverNoneHint }]),
    { value: 'existing', label: x.serverExisting, hint: x.serverExistingHint },
    { value: 'new', label: x.serverNew, hint: x.serverNewHint },
  ];

  const remoteChoices: { value: InterviewRemote; label: string; hint: string }[] = [
    { value: 'none', label: x.remoteNone, hint: x.remoteNoneHint },
    { value: 'vpn', label: x.remoteVpn, hint: x.remoteVpnHint },
    ...(answers.server !== 'none'
      ? [{ value: 'tunnel' as const, label: x.remoteTunnel, hint: x.remoteTunnelHint }]
      : []),
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
        gap: 14,
        alignItems: 'start',
        maxWidth: 1180,
      }}
    >
      <Card wide>
        <Title>{x.title}</Title>
        <Lead>{preview || !estate.snapshot ? x.leadNoSurvey : x.lead}</Lead>

        {!hostOnly ? (
          <Question title={x.homesTitle}>
            <Choices
              value={answers.homes}
              accent={accent}
              options={[
                { value: 'one', label: x.homesOne, hint: x.homesOneHint },
                { value: 'several', label: x.homesSeveral, hint: x.homesSeveralHint },
              ]}
              onChange={(homes) =>
                set(homes === 'several' ? { homes, homeNames: homeNames } : { homes })
              }
            />
            {answers.homes === 'several' ? (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11.5, fontWeight: 500, marginBottom: 4 }}>
                  {x.homeNamesLabel}
                </div>
                <div style={{ display: 'grid', gap: 6, maxWidth: 380 }}>
                  {homeNames.map((name, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8 }}>
                      <input
                        className="input"
                        value={name}
                        onChange={(e) =>
                          set({ homeNames: homeNames.map((n, j) => (j === i ? e.target.value : n)) })
                        }
                      />
                      {homeNames.length > 2 ? (
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => set({ homeNames: homeNames.filter((_, j) => j !== i) })}
                        >
                          {x.removeHome}
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="link"
                  style={{ fontSize: 11.5, marginTop: 8 }}
                  onClick={() =>
                    set({ homeNames: [...homeNames, x.homeNumbered(homeNames.length + 1)] })
                  }
                >
                  {x.addHome}
                </button>
                <Hint>{x.homeNamesHint}</Hint>
              </div>
            ) : null}
          </Question>
        ) : null}

        {!hostOnly ? (
          <Question title={x.houseTitle}>
            <Check
              checked={answers.cameras}
              label={x.cameras}
              hint={x.camerasHint}
              onChange={(cameras) => set({ cameras })}
            />
            {answers.cameras ? (
              <label style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '8px 0 0 26px' }}>
                <span style={{ fontSize: 11.5 }}>{x.cameraCount}</span>
                <input
                  className="input input--mono"
                  type="number"
                  min={1}
                  max={64}
                  value={answers.cameraCount}
                  style={{ width: 80 }}
                  onChange={(e) => set({ cameraCount: Number(e.target.value) || 1 })}
                />
              </label>
            ) : null}
            {answers.homes === 'several' ? (
              <Check
                checked={answers.sharedPrinter}
                label={x.printer}
                hint={x.printerHint}
                onChange={(sharedPrinter) => set({ sharedPrinter })}
              />
            ) : null}
          </Question>
        ) : null}

        <Question title={x.serverTitle}>
          <Hint>{hostOnly ? x.serverOnlyHint : x.serverHint}</Hint>
          {facts.hostName ? <Hint>{x.serverSeen(facts.hostName)}</Hint> : null}
          <Choices
            value={answers.server}
            accent={accent}
            options={serverChoices}
            onChange={(server) =>
              set(server === 'none' && answers.remote === 'tunnel' ? { server, remote: 'none' } : { server })
            }
          />
        </Question>

        {answers.server !== 'none' ? (
          <Question title={x.servicesTitle}>
            {offered.map((service) => (
              <div key={service}>
                <Check
                  checked={answers.services.includes(service)}
                  label={x.services[service].label}
                  hint={x.services[service].hint}
                  onChange={(on) =>
                    set({
                      services: on
                        ? [...answers.services, service]
                        : answers.services.filter((s) => s !== service),
                    })
                  }
                />
                {facts.running[service] ? (
                  <div
                    className="pretty"
                    style={{ fontSize: 10.5, color: palette.warn, margin: '2px 0 6px 26px', lineHeight: 1.5 }}
                  >
                    {x.alreadyRunning(facts.running[service] ?? '')}
                  </div>
                ) : null}
              </div>
            ))}
          </Question>
        ) : null}

        {!hostOnly ? (
          <Question title={x.remoteTitle}>
            <Choices
              value={answers.remote}
              accent={accent}
              options={remoteChoices}
              onChange={(remote) => set({ remote })}
            />
          </Question>
        ) : null}

        {!hostOnly ? (
          <Question title={x.wifiTitle}>
            <div style={{ display: 'grid', gap: 10, maxWidth: 380 }}>
              <Field
                label={x.wifiMain}
                hint={facts.wifiName && answers.wifiName === facts.wifiName ? x.wifiKept : x.wifiNew}
              >
                <input
                  className="input"
                  value={answers.wifiName}
                  onChange={(e) => set({ wifiName: e.target.value })}
                />
              </Field>
              <Field
                label={x.wifiGuest}
                hint={
                  facts.guestWifiName && answers.guestWifiName === facts.guestWifiName
                    ? x.wifiKept
                    : undefined
                }
              >
                <input
                  className="input"
                  value={answers.guestWifiName}
                  onChange={(e) => set({ guestWifiName: e.target.value })}
                />
              </Field>
            </div>
          </Question>
        ) : null}
        {result && asked.length > 0 ? (
          <Question title={x.portsTitle}>
            <Hint>{result.placed.length > 0 ? x.portsPlacedHint : x.portsHint}</Hint>
            <div style={{ display: 'grid', gap: 8 }}>
              {asked.map((p) => (
                <label
                  key={p.id}
                  style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 10, alignItems: 'center' }}
                >
                  <span style={{ fontSize: 11.5, lineHeight: 1.4 }}>
                    <span className="mono">{x.portName(p.device, p.idx)}</span>
                    {p.label ? <span style={{ color: 'var(--text3)' }}> — {p.label}</span> : null}
                  </span>
                  <select
                    className="input"
                    value={portNetworks[p.id] ?? p.nativeVlan}
                    style={{
                      fontSize: 11.5,
                      borderColor: result.orphans.some((o) => o.id === p.id) ? palette.bad : undefined,
                    }}
                    onChange={(e) =>
                      setPortNetworks((prev) => ({ ...prev, [p.id]: Number(e.target.value) || 0 }))
                    }
                  >
                    <option value={0}>{x.portsUnset}</option>
                    {result.resolved.networks.map((n) => (
                      <option key={n.vlan} value={n.vlan}>
                        {n.name} — {n.purpose}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </Question>
        ) : null}
      </Card>

      <Card wide>
        <Title>{x.previewTitle}</Title>
        {result ? (
          <>
            <Section title={result.resolved.networks.length > 0 ? x.previewNetworks(result.resolved.networks.length) : undefined}>
              {result.resolved.networks.length === 0 ? (
                <Lead>{x.previewNoNetworks}</Lead>
              ) : (
                <Rows
                  rows={result.resolved.networks.map((n) => ({
                    key: `n-${n.vlan}`,
                    name: n.name,
                    meta: n.vlan > 0 ? `VLAN ${n.vlan}` : '',
                    text: n.purpose,
                  }))}
                />
              )}
            </Section>

            {result.resolved.ssids.length > 0 ? (
              <Section title={x.previewWifi}>
                <Rows
                  rows={result.resolved.ssids.map((s) => ({
                    key: `s-${s.name}`,
                    name: s.name,
                    meta: '',
                    text: s.purpose,
                  }))}
                />
              </Section>
            ) : null}

            {result.resolved.guests.length > 0 ? (
              <Section title={x.previewMachines(result.resolved.guests.length)}>
                <Rows
                  rows={result.resolved.guests.map((g) => ({
                    key: `g-${g.vmid}`,
                    name: g.name,
                    meta: g.ip ?? '',
                    text: g.purpose,
                  }))}
                />
              </Section>
            ) : null}

            {answers.server === 'new' && result.resolved.storage.some((s) => s.destructive) ? (
              <Note color={palette.warn}>{x.previewStorageBuild}</Note>
            ) : null}
            {answers.server === 'existing' && result.resolved.modules.some((m) => m.id === 'storage') ? (
              <Note>{x.previewStorageExisting(String(result.blueprint.params['fastPoolName'] ?? ''))}</Note>
            ) : null}
            {answers.remote === 'vpn' ? <Note>{x.remoteVpnHint}</Note> : null}

            {result.placed.length > 0 ? <Note>{x.portsPlaced(result.placed.length)}</Note> : null}

            {result.untouched.length > 0 ? (
              <Section title={x.previewUntouched}>
                <Rows
                  rows={result.untouched.map((n) => ({
                    key: `u-${n.name}`,
                    name: n.name,
                    meta: n.subnet,
                    text: '',
                  }))}
                />
              </Section>
            ) : null}
            {result.resolved.networks.length > 0 ? <Note>{x.previewNoDelete}</Note> : null}

            <div
              className="pretty"
              style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6, marginTop: 14 }}
            >
              {x.previewPlan(
                result.plan.steps.length,
                hours(result.plan.totalMinutes),
                result.plan.counts.auto,
                result.plan.counts.assisted,
                result.plan.counts.manual,
              )}
            </div>

            {errors.length > 0 ? (
              <Note color={palette.bad}>
                {x.previewErrors}
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {errors.map((e) => (
                    <li key={e.message}>{e.message}</li>
                  ))}
                </ul>
              </Note>
            ) : null}

            {guided && editedSinceAnswered(guided) ? (
              <Note color={palette.warn}>{x.editedWarning}</Note>
            ) : null}

            <Actions>
              <button
                type="button"
                className="btn-primary"
                disabled={errors.length > 0}
                style={vars({ '--btn-bg': accent })}
                onClick={save}
              >
                {guided ? x.saveAgain : x.save}
              </button>
              {onCancel ? (
                <button type="button" className="btn-ghost" onClick={onCancel}>
                  {x.cancel}
                </button>
              ) : null}
            </Actions>
            {adoptable ? (
              <button type="button" className="link" style={{ fontSize: 11.5, marginTop: 12 }} onClick={adopt}>
                {x.adopt(adoptable.name)}
              </button>
            ) : null}
          </>
        ) : null}
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------- network */

/**
 * The network, written the way it always was.
 *
 * Backup and dry run on arrival, then one sentence per kind of change and one
 * button, bound to the token of the dry run on screen. What is new is only
 * the way out: a network that needs nothing, a run that finished, and a run
 * that cannot go ahead all lead on to the rest of the plan rather than ending
 * the path.
 */
function NetworkCard({
  apply,
  busy,
  palette,
  accent,
  goTo,
  onContinue,
}: {
  apply: ApplyApi;
  busy: boolean;
  palette: Palette;
  accent: string;
  goTo: (view: ViewId) => void;
  onContinue: () => void;
}) {
  const t = useT();

  if (apply.run) {
    const applied = apply.run.entries.filter((e) => e.outcome === 'applied').length;
    const failed = apply.run.entries.filter((e) => e.outcome === 'failed').length;
    return (
      <Card>
        <Title>{t.guided.doneTitle}</Title>
        <Lead>{t.guided.doneBody(applied, failed)}</Lead>
        <Actions>
          <button
            type="button"
            className="btn-primary"
            style={vars({ '--btn-bg': accent })}
            onClick={onContinue}
          >
            {t.guided.continueToSteps}
          </button>
          <button type="button" className="btn-ghost" onClick={() => goTo('planner')}>
            {t.guided.seeDetail}
          </button>
          {applied > 0 ? (
            <button type="button" className="btn-ghost" onClick={() => void apply.rollback()}>
              {t.guided.undo}
            </button>
          ) : null}
        </Actions>
      </Card>
    );
  }

  if (!apply.report || !apply.gates.backup.ready) {
    return (
      <Card>
        <Title>{t.guided.prepareTitle}</Title>
        <Lead>{t.guided.networkLead}</Lead>
        <div style={{ height: 10 }} />
        <Lead>{t.guided.prepareBody}</Lead>
        {apply.error ? (
          <Actions>
            <button type="button" className="btn-ghost" onClick={onContinue}>
              {t.guided.skipNetwork}
            </button>
          </Actions>
        ) : null}
      </Card>
    );
  }

  const report = apply.report;
  return (
    <Card>
      <Title>{t.guided.confirmTitle}</Title>
      <Lead>{t.guided.networkLead}</Lead>
      {apply.writableCount === 0 ? (
        <>
          <div style={{ height: 10 }} />
          <Lead>{t.guided.nothingToDo}</Lead>
          <Actions>
            <button
              type="button"
              className="btn-primary"
              style={vars({ '--btn-bg': accent })}
              onClick={onContinue}
            >
              {t.guided.continueToSteps}
            </button>
          </Actions>
        </>
      ) : (
        <>
          <div style={{ height: 10 }} />
          <Lead>{t.guided.confirmBody}</Lead>
          <ul
            className="pretty"
            style={{ margin: '12px 0 0 18px', padding: 0, fontSize: 12.5, lineHeight: 1.8 }}
          >
            {summarise(report, t).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {apply.gates.backup.path ? (
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 12 }}>
              {t.guided.backupTaken}
            </div>
          ) : null}
          <Actions>
            <button
              type="button"
              className="btn-primary"
              disabled={busy || report.blockers.length > 0}
              style={vars({ '--btn-bg': accent })}
              onClick={() => void apply.applyShown()}
            >
              {apply.busy ? t.guided.applying : t.guided.applyAction(apply.writableCount)}
            </button>
            <button type="button" className="btn-ghost" onClick={() => goTo('planner')}>
              {t.guided.seeDetail}
            </button>
            <button type="button" className="btn-ghost" onClick={onContinue}>
              {t.guided.skipNetwork}
            </button>
          </Actions>
        </>
      )}

      {report.blockers.length > 0 ? (
        <div
          className="pretty"
          style={{ fontSize: 11.5, color: palette.warn, marginTop: 12, lineHeight: 1.6 }}
        >
          {t.guided.heldBack}
        </div>
      ) : null}
    </Card>
  );
}

/* ------------------------------------------------------------------- walk */

/**
 * The rest of the plan, one step at a time.
 *
 * The plan tab shows forty steps and trusts the reader to know which one they
 * are on. This shows one: the first that is not done and has nothing left to
 * wait for. Above it, how far along the whole thing is; on it, who does it and
 * where, in a sentence; below it, the step itself, with the same commands,
 * the same approvals and the same refusals as everywhere else — the step body
 * is the planner's, not a second copy of it.
 *
 * "Skip for now" moves on without claiming anything. The whole list is one
 * click away for anyone who would rather choose.
 */
function Walk({
  plan,
  progress,
  estate,
  surveyable,
  palette,
  accent,
  copy,
  goTo,
  onEditAnswers,
}: {
  plan: Plan;
  progress: ProgressApi;
  estate: EstateApi;
  surveyable: string[];
  palette: Palette;
  accent: string;
  copy: CopyApi;
  goTo: (view: ViewId) => void;
  onEditAnswers: () => void;
}) {
  const t = useT();
  const w = t.guided.walk;
  const hours = useHours();
  const runner = usePlanRunner(estate.profiles);
  const [focus, setFocus] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const { done } = progress;
  const byId = useMemo(() => new Map(plan.steps.map((s) => [s.id, s])), [plan]);
  const stepTitles = useMemo(() => new Map(plan.steps.map((s) => [s.id, s.title])), [plan]);
  const waitingOn = (s: PlanStep) => s.requires.filter((id) => !done.has(id));

  const open = plan.steps.filter((s) => !done.has(s.id));
  const next =
    open.find((s) => !skipped.has(s.id) && waitingOn(s).length === 0) ??
    open.find((s) => !skipped.has(s.id)) ??
    open[0];
  const current = (focus ? byId.get(focus) : undefined) ?? next;

  const doneCount = plan.steps.length - open.length;
  const remaining = open.reduce((sum, s) => sum + s.minutes, 0);

  const hasCommands = plan.steps.some((s) => s.actions.some((a) => a.kind === 'command'));

  const moveOn = () => setFocus(null);

  return (
    <div style={{ maxWidth: 900 }}>
      <Card>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{w.progress(doneCount, plan.steps.length)}</span>
          {remaining > 0 ? (
            <span style={{ fontSize: 11.5, color: 'var(--text2)' }}>{w.remaining(hours(remaining))}</span>
          ) : null}
          <span style={{ flex: 1 }} />
          <button type="button" className="link" style={{ fontSize: 11.5 }} onClick={onEditAnswers}>
            {w.editAnswers}
          </button>
          <button type="button" className="link" style={{ fontSize: 11.5 }} onClick={() => goTo('planner')}>
            {t.guided.seeDetail}
          </button>
        </div>
        <div style={{ marginTop: 10 }}>
          <Meter
            percent={plan.steps.length > 0 ? (doneCount / plan.steps.length) * 100 : 100}
            color={palette.ok}
          />
        </div>
        {runner.supported && !runner.readyFor('proxmox') && hasCommands ? (
          <div className="pretty" style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10, lineHeight: 1.55 }}>
            {w.sshHint}
          </div>
        ) : null}
      </Card>

      {!current ? (
        <Card>
          <Title>{w.finishedTitle}</Title>
          <Lead>{w.finishedBody}</Lead>
          <Actions>
            <button
              type="button"
              className="btn-primary"
              disabled={estate.running || surveyable.length === 0}
              style={vars({ '--btn-bg': accent })}
              onClick={() => void estate.run(surveyable)}
            >
              {estate.running ? t.guided.looking : w.surveyAgain}
            </button>
          </Actions>
        </Card>
      ) : (
        <CurrentStep
          key={current.id}
          step={current}
          plan={plan}
          progress={progress}
          runner={runner}
          stepTitles={stepTitles}
          waiting={waitingOn(current).map((id) => byId.get(id)).filter((s): s is PlanStep => !!s)}
          palette={palette}
          accent={accent}
          copy={copy}
          onJump={(id) => setFocus(id)}
          onDone={() => {
            progress.mark(current, 'manual');
            moveOn();
          }}
          onUndone={() => progress.unmark(current)}
          onNext={moveOn}
          onSkip={() => {
            setSkipped((prev) => new Set(prev).add(current.id));
            moveOn();
          }}
        />
      )}

      <Card>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{w.allTitle}</span>
          <span style={{ flex: 1 }} />
          <button type="button" className="link" style={{ fontSize: 11.5 }} onClick={() => setShowAll((v) => !v)}>
            {showAll ? w.hideAll : w.showAll}
          </button>
        </div>
        {showAll
          ? plan.modules.map((pm) => (
              <div key={pm.module.id} style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}>
                  <span className="mono" style={{ color: 'var(--text3)', marginRight: 6 }}>
                    {pm.module.code}.
                  </span>
                  {pm.module.title}
                </div>
                {pm.steps.map((s) => {
                  const status = progress.statusOf(s);
                  const state = done.has(s.id)
                    ? 'done'
                    : status?.stale
                      ? 'stale'
                      : waitingOn(s).length > 0
                        ? 'blocked'
                        : 'open';
                  const tone =
                    state === 'done'
                      ? palette.ok
                      : state === 'stale'
                        ? palette.warn
                        : state === 'blocked'
                          ? palette.idle
                          : accent;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className="row-hover"
                      onClick={() => setFocus(s.id)}
                      style={{
                        display: 'flex',
                        width: '100%',
                        gap: 10,
                        alignItems: 'center',
                        padding: '5px 6px',
                        border: 0,
                        borderRadius: 6,
                        background: s.id === current?.id ? tint(accent, '14') : 'transparent',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        color: 'inherit',
                        fontSize: 11.5,
                      }}
                    >
                      <Pill color={tone} tight>
                        {w.status[state]}
                      </Pill>
                      <span style={{ flex: 1 }}>{s.title}</span>
                    </button>
                  );
                })}
              </div>
            ))
          : null}
      </Card>
    </div>
  );
}

function CurrentStep({
  step,
  plan,
  progress,
  runner,
  stepTitles,
  waiting,
  palette,
  accent,
  copy,
  onJump,
  onDone,
  onUndone,
  onNext,
  onSkip,
}: {
  step: PlanStep;
  plan: Plan;
  progress: ProgressApi;
  runner: ReturnType<typeof usePlanRunner>;
  stepTitles: Map<string, string>;
  waiting: PlanStep[];
  palette: Palette;
  accent: string;
  copy: CopyApi;
  onJump: (id: string) => void;
  onDone: () => void;
  onUndone: () => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const t = useT();
  const w = t.guided.walk;
  const module = plan.modules.find((m) => m.module.id === step.moduleId)?.module;
  const done = progress.done.has(step.id);
  const target = step.actions[0]?.target ?? 'host';

  /*
   * Who does it, said once and plainly.
   *
   * Worked out from the same facts the step body acts on — whether anything
   * here destroys data, whether it can cut the session, whether a command
   * exists and a machine can be reached — so the sentence cannot promise what
   * the controls below will then refuse.
   */
  const commands = step.actions.filter((a) => a.kind === 'command' && !a.destructive);
  const who =
    step.actions.length === 0
      ? w.who.read
      : writtenByApplier(step)
        ? w.who.applier
        : step.actions.some((a) => a.destructive) || step.capability === 'manual'
        ? w.who.manual
        : step.requiresLocalConsole
          ? w.who.console
          : commands.length > 0
            ? runner.readyFor(commands[0]?.target ?? 'proxmox')
              ? w.who.run(runner.routeFor(commands[0]?.target ?? 'proxmox')?.sshHost ?? '')
              : w.who.copy
            : w.who.ui;

  return (
    <Card>
      {module ? (
        <div className="mono" style={{ fontSize: 10.5, color: 'var(--text3)', marginBottom: 6 }}>
          {module.code}. {module.title}
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <span className="sect">{w.nowTitle}</span>
        {done ? (
          <Pill color={palette.ok} tight>
            {t.plan.stepDone}
          </Pill>
        ) : null}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{step.title}</div>
      <Lead>{step.detail}</Lead>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 10,
          margin: '14px 0',
        }}
      >
        <div className="soft" style={{ padding: '10px 12px' }}>
          <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 4 }}>{w.whoTitle}</div>
          <div className="pretty" style={{ fontSize: 11.5, color: 'var(--text2)', lineHeight: 1.55 }}>
            {who}
          </div>
        </div>
        <div className="soft" style={{ padding: '10px 12px' }}>
          <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 4 }}>{w.whereTitle}</div>
          <div className="pretty" style={{ fontSize: 11.5, color: 'var(--text2)', lineHeight: 1.55 }}>
            {w.where[target]}
          </div>
        </div>
      </div>

      {waiting.length > 0 ? (
        <div className="soft" style={{ padding: '10px 12px', marginBottom: 14, borderColor: palette.warn }}>
          <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 6 }}>{w.blocked}</div>
          {waiting.map((s) => (
            <div key={s.id} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 11.5, padding: '2px 0' }}>
              <span style={{ flex: 1 }}>{s.title}</span>
              <button type="button" className="link" style={{ fontSize: 11 }} onClick={() => onJump(s.id)}>
                {w.goTo}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <StepBody
        step={step}
        effective={effectiveLevel('auto', step.capability)}
        blockedBy={waiting.map((s) => s.title)}
        stepTitles={stepTitles}
        done={done}
        status={progress.statusOf(step)}
        onDone={(yes) => (yes ? progress.mark(step, 'manual') : progress.unmark(step))}
        onRan={() => progress.mark(step, 'ran')}
        palette={palette}
        accent={accent}
        copy={copy}
        runner={runner}
        showDoneTick={false}
      />

      <Actions>
        {done ? (
          <>
            <button
              type="button"
              className="btn-primary"
              style={vars({ '--btn-bg': accent })}
              onClick={onNext}
            >
              {w.next}
            </button>
            <button type="button" className="btn-ghost" onClick={onUndone}>
              {w.notDone}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn-primary"
              style={vars({ '--btn-bg': accent })}
              onClick={onDone}
            >
              {w.doneNext}
            </button>
            <button type="button" className="btn-ghost" onClick={onSkip}>
              {w.skip}
            </button>
          </>
        )}
      </Actions>
    </Card>
  );
}

/* ------------------------------------------------------------ connecting */

/**
 * Four fields and a fingerprint.
 *
 * The expert screen asks for eleven, because a profile can be many things: an
 * API endpoint, an ssh host, both, with a site name and an auth method and a
 * port. Someone connecting for the first time has none of those distinctions in
 * their head, and asking for them is asking them to learn the model before they
 * are allowed to use the application. So: what kind of machine, where, and who
 * you are — everything else takes a sensible default and stays changeable on
 * the screen built for changing it.
 *
 * The certificate step is not skipped, and not made prettier than it is. It is
 * the one moment where a person is being asked to vouch for something they
 * cannot verify from here, and the honest thing is to say so plainly and let
 * them compare it against the machine's own screen. What it does not do is
 * accept on their behalf.
 */
function ConnectCard({
  estate,
  palette,
  accent,
  goTo,
}: {
  estate: EstateApi;
  palette: Palette;
  accent: string;
  goTo: (view: ViewId) => void;
}) {
  const t = useT();
  const [kind, setKind] = useState<'unifi' | 'proxmox'>('unifi');
  const [address, setAddress] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * Shell access, offered rather than assumed.
   *
   * Without it the application reads what the controller says about itself and
   * stops there, which leaves two things it could otherwise do: read the
   * ruleset the gateway is actually holding, and read what a narrow Proxmox
   * token was refused. It also leaves every rule that denies something
   * unwritable, since the instrument that would confirm the result is missing.
   * That is worth one sentence and two more fields, and worth nothing at all if
   * it turns the form into a questionnaire — so it is folded away until asked
   * for, and the address is reused rather than asked for twice.
   */
  const [withSsh, setWithSsh] = useState(false);
  const [sshUser, setSshUser] = useState('root');
  const [sshPassword, setSshPassword] = useState('');

  /*
   * Two fingerprints, one after the other.
   *
   * The certificate and the host key are separate promises about separate
   * protocols, and each is a moment where a person vouches for something this
   * cannot check for them. Presenting both at once would invite one glance and
   * two acceptances.
   */
  const [pending, setPending] = useState<
    | { stage: 'cert'; profile: Profile; probe: EndpointProbe }
    | { stage: 'host'; profile: Profile; probe: HostKeyProbe }
    | null
  >(null);

  const ready =
    address.trim().length > 0 &&
    username.trim().length > 0 &&
    password.length > 0 &&
    (!withSsh || (sshUser.trim().length > 0 && sshPassword.length > 0));

  /** The bare host the ssh side needs: no scheme, no port, no path. */
  const hostOf = (raw: string): string =>
    raw
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '')
      .replace(/:\d+$/, '');

  /**
   * `192.168.1.1` is what a person types; an origin is what the native side
   * needs. Assuming https rather than refusing the input: every controller and
   * every hypervisor here serves over it, and a plain host name with no scheme
   * is the overwhelmingly common way to write one down.
   */
  const originOf = (raw: string): string => {
    const trimmed = raw.trim().replace(/\/+$/, '');
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}${kind === 'proxmox' && !/:\d+$/.test(trimmed) ? ':8006' : ''}`;
  };

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const baseUrl = originOf(address);
      const saved = await estate.saveProfile({
        id: `${kind}-${Date.now().toString(36)}`,
        kind,
        label: kind === 'unifi' ? t.guided.kindUnifi : t.guided.kindProxmox,
        baseUrl,
        username: username.trim(),
        site: '',
        fingerprint: null,
        sshEnabled: withSsh,
        sshHost: withSsh ? hostOf(address) : '',
        sshPort: withSsh ? 22 : 0,
        sshUsername: withSsh ? sshUser.trim() : '',
        sshAuthMethod: withSsh ? 'password' : '',
        sshFingerprint: null,
        flavour: '',
        createdAt: '',
        lastRun: null,
      });
      if (!saved) return;

      // The credential goes straight into the operating system's own store;
      // nothing here keeps it, and nothing can read it back.
      const stored = await estate.setSecret(saved.id, password);
      setPassword('');
      if (!stored) {
        setError(t.guided.secretFailed);
        return;
      }

      // The ssh credential has a slot of its own, so one machine reached two
      // ways keeps two secrets rather than sharing one.
      if (withSsh) {
        const sshStored = await estate.setSecret(saved.id, sshPassword, true);
        setSshPassword('');
        if (!sshStored) {
          setError(t.guided.secretFailed);
          return;
        }
      }

      const probe = await estate.probe(saved.baseUrl, null);
      if (!probe?.reachable) {
        setError(probe?.message || t.guided.unreachable);
        return;
      }
      setPending({ stage: 'cert', profile: saved, probe });
    } finally {
      setBusy(false);
    }
  };

  const accept = async () => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      if (pending.stage === 'host') {
        await estate.saveProfile({
          ...pending.profile,
          sshFingerprint: pending.probe.fingerprint,
        });
        setPending(null);
        return;
      }

      const saved = await estate.saveProfile({
        ...pending.profile,
        fingerprint: pending.probe.fingerprint,
      });
      if (!saved) return;

      if (!saved.sshEnabled) {
        setPending(null);
        return;
      }

      /*
       * The host key, asked for separately.
       *
       * A refusal here is not a failure of the whole connection: the API half
       * is set up and works, and shell access is the extra. So it says what
       * went wrong and leaves the profile as it is, rather than unwinding
       * something that is already good.
       */
      const probe = await estate.probeSsh(saved.sshHost, saved.sshPort, null);
      if (!probe?.reachable) {
        setError(probe?.message || t.guided.sshUnreachable);
        setPending(null);
        return;
      }
      setPending({ stage: 'host', profile: saved, probe });
    } finally {
      setBusy(false);
    }
  };

  if (pending) {
    const isHost = pending.stage === 'host';
    return (
      <Card>
        <Title>{isHost ? t.guided.hostTitle : t.guided.certTitle}</Title>
        <Lead>{isHost ? t.guided.hostBody : t.guided.certBody}</Lead>
        <div
          className="mono"
          style={{
            fontSize: 12,
            marginTop: 12,
            padding: '10px 12px',
            background: 'var(--panel2)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            wordBreak: 'break-all',
          }}
        >
          {pending.probe.fingerprintDisplay || pending.probe.fingerprint}
        </div>
        <Actions>
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            style={vars({ '--btn-bg': accent })}
            onClick={() => void accept()}
          >
            {t.guided.certAccept}
          </button>
          <button type="button" className="btn-ghost" onClick={() => setPending(null)}>
            {t.common.cancel}
          </button>
        </Actions>
      </Card>
    );
  }

  return (
    <Card>
      <Title>{t.guided.connectTitle}</Title>
      <Lead>{t.guided.connectBody}</Lead>

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        {(['unifi', 'proxmox'] as const).map((k) => (
          <button
            key={k}
            type="button"
            className="subtab"
            aria-pressed={kind === k}
            style={vars({
              '--tab-bg': kind === k ? 'var(--panel)' : 'transparent',
              '--tab-fg': kind === k ? 'var(--text)' : 'var(--text2)',
            })}
            onClick={() => setKind(k)}
          >
            {k === 'unifi' ? t.guided.kindUnifi : t.guided.kindProxmox}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 10, marginTop: 14, maxWidth: 420 }}>
        <Field label={t.guided.fieldAddress} hint={t.guided.fieldAddressHint(kind)}>
          <input
            className="input"
            value={address}
            placeholder={kind === 'unifi' ? '192.168.1.1' : '192.168.1.10'}
            onChange={(e) => setAddress(e.target.value)}
          />
        </Field>
        <Field label={t.guided.fieldUser} hint={t.guided.fieldUserHint(kind)}>
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </Field>
        <Field label={t.guided.fieldPassword} hint={t.guided.fieldPasswordHint(kind)}>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
      </div>

      <div
        style={{
          marginTop: 16,
          paddingTop: 14,
          borderTop: '1px solid var(--line)',
          maxWidth: 420,
        }}
      >
        <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={withSsh}
            onChange={(e) => setWithSsh(e.target.checked)}
            style={{ marginTop: 2 }}
          />
          <span>
            <span style={{ fontSize: 12, fontWeight: 500 }}>{t.guided.sshOffer}</span>
            <span
              className="pretty"
              style={{ display: 'block', fontSize: 11, color: 'var(--text3)', marginTop: 3, lineHeight: 1.55 }}
            >
              {t.guided.sshWhy}
            </span>
          </span>
        </label>

        {withSsh ? (
          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            <Field label={t.guided.sshUser} hint={t.guided.sshUserHint(hostOf(address) || '—')}>
              <input
                className="input"
                value={sshUser}
                onChange={(e) => setSshUser(e.target.value)}
              />
            </Field>
            <Field label={t.guided.sshPassword}>
              <input
                className="input"
                type="password"
                value={sshPassword}
                onChange={(e) => setSshPassword(e.target.value)}
              />
            </Field>
          </div>
        ) : null}
      </div>

      <Actions>
        <button
          type="button"
          className="btn-primary"
          disabled={!ready || busy}
          style={vars({ '--btn-bg': accent })}
          onClick={() => void connect()}
        >
          {busy ? t.guided.connecting : t.guided.connectAction}
        </button>
        <button type="button" className="btn-ghost" onClick={() => goTo('survey')}>
          {t.guided.connectAdvanced}
        </button>
      </Actions>

      {error ? (
        <div className="pretty" style={{ fontSize: 11.5, color: palette.bad, marginTop: 12 }}>
          {error}
        </div>
      ) : null}

      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 14, lineHeight: 1.6 }}>
        {t.guided.secretNote}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------- bits */

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 11.5, fontWeight: 500, marginBottom: 4 }}>{label}</div>
      {children}
      {hint ? (
        <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 4, lineHeight: 1.5 }}>
          {hint}
        </div>
      ) : null}
    </label>
  );
}

function Steps({
  step,
  preview,
  palette,
  accent,
}: {
  step: Step;
  preview: boolean;
  palette: Palette;
  accent: string;
}) {
  const t = useT();
  const at = ORDER.indexOf(step);

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '4px 0 18px' }}>
      {ORDER.map((s, i) => (
        <Pill
          key={s}
          color={
            i === at
              ? accent
              : preview && (s === 'connect' || s === 'look' || s === 'network')
                ? palette.idle
                : i < at
                  ? palette.ok
                  : palette.idle
          }
          tight
        >
          {t.guided.steps[s]}
        </Pill>
      ))}
    </div>
  );
}

/** A question: a heading, then whatever answers it. */
function Question({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

/** One of several, each with the sentence that says what choosing it means. */
function Choices<V extends string>({
  value,
  options,
  accent,
  onChange,
}: {
  value: V;
  options: { value: V; label: string; hint: string }[];
  accent: string;
  onChange: (value: V) => void;
}) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            className="tile"
            aria-pressed={on}
            style={vars({
              '--tile-bg': on ? tint(accent, '14') : 'transparent',
              '--tile-bc': on ? tint(accent, '66') : 'var(--line)',
            })}
            onClick={() => onChange(o.value)}
          >
            <div style={{ fontSize: 12, fontWeight: 500 }}>{o.label}</div>
            <div className="pretty" style={{ fontSize: 10.5, color: 'var(--text2)', marginTop: 3, lineHeight: 1.5 }}>
              {o.hint}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function Check({
  checked,
  label,
  hint,
  onChange,
}: {
  checked: boolean;
  label: string;
  hint: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer', padding: '4px 0' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 2 }}
      />
      <span>
        <span style={{ fontSize: 12, fontWeight: 500 }}>{label}</span>
        <span
          className="pretty"
          style={{ display: 'block', fontSize: 10.5, color: 'var(--text3)', marginTop: 2, lineHeight: 1.5 }}
        >
          {hint}
        </span>
      </span>
    </label>
  );
}

function Section({ title, children }: { title?: string | undefined; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 12 }}>
      {title ? <div className="sect" style={{ marginBottom: 6 }}>{title}</div> : null}
      {children}
    </div>
  );
}

/** Name, a quiet detail, and what it is for — one line each. */
function Rows({ rows }: { rows: { key: string; name: string; meta: string; text: string }[] }) {
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      {rows.map((r) => (
        <div key={r.key} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 11.5, lineHeight: 1.45 }}>
          <span className="mono" style={{ fontSize: 11, flex: 'none' }}>
            {r.name}
          </span>
          {r.meta ? (
            <span className="mono" style={{ fontSize: 10, color: 'var(--text3)', flex: 'none' }}>
              {r.meta}
            </span>
          ) : null}
          <span className="pretty" style={{ color: 'var(--text2)' }}>
            {r.text}
          </span>
        </div>
      ))}
    </div>
  );
}

function Note({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <div
      className="pretty"
      style={{ fontSize: 11, color: color ?? 'var(--text3)', marginTop: 12, lineHeight: 1.6 }}
    >
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="pretty" style={{ fontSize: 10.5, color: 'var(--text3)', margin: '4px 0 8px', lineHeight: 1.5 }}>
      {children}
    </div>
  );
}

function Card({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="panel" style={{ padding: '18px 20px', marginBottom: 14, maxWidth: wide ? undefined : 720 }}>
      {children}
    </div>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{children}</div>;
}

function Lead({ children }: { children: React.ReactNode }) {
  return (
    <div className="pretty" style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.65 }}>
      {children}
    </div>
  );
}

function Actions({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 16 }}>
      {children}
    </div>
  );
}
