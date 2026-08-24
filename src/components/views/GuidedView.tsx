import { useEffect, useState } from 'react';
import type { DryRunReport } from '@/apply/model';
import type { ViewId } from '@/config';
import { useT } from '@/i18n';
import { vars } from '@/lib/css';
import type { Palette } from '@/lib/palette';
import type { ApplyApi } from '@/state/useApply';
import type { EstateApi } from '@/state/useEstate';
import type { EndpointProbe, HostKeyProbe, Profile } from '@/survey/model';
import { Pill, ViewHeading } from '../ui';

/*
 * The guided path.
 *
 * Everything else in this application is a instrument panel, and instruments
 * assume somebody who knows what reading they are looking for. That is the
 * right shape for the person who came here on purpose, and the wrong one for
 * the person who has a network, a suspicion that it could be better, and no
 * vocabulary for VLANs or zones or dry runs. For them the question is not
 * "which view" but "what now", and until this existed the application had no
 * answer to it.
 *
 * So: one screen, four steps, and at each step exactly one thing to press. It
 * drives the machinery the expert views drive — the same survey, the same
 * blueprint, the same guarded write path — and adds nothing of its own except
 * an order and plainer words.
 *
 * What it deliberately does not do is decide for you at the end. The backup and
 * the dry run happen on their own, because nobody who needs this screen knows
 * to ask for them; the change itself waits behind a sentence saying what it is
 * about to do. Automatic up to the last step, and never past it.
 */

type Step = 'connect' | 'look' | 'prepare' | 'confirm' | 'done';

function stepOf(estate: EstateApi, apply: ApplyApi): Step {
  if (apply.run) return 'done';
  if (estate.profiles.filter((p) => p.fingerprint).length === 0) return 'connect';
  if (estate.mode !== 'survey' || !estate.snapshot) return 'look';
  if (!apply.report || !apply.gates.backup.ready) return 'prepare';
  return 'confirm';
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

export function GuidedView({
  estate,
  apply,
  palette,
  accent,
  goTo,
}: {
  estate: EstateApi;
  apply: ApplyApi;
  palette: Palette;
  accent: string;
  goTo: (view: ViewId) => void;
}) {
  const t = useT();
  const step = stepOf(estate, apply);
  const busy = estate.running || apply.busy !== null;

  /*
   * The one place this takes an action nobody pressed.
   *
   * A backup and a dry run change nothing and are needed before anything can be
   * shown, so making the user ask for them is asking them to know they exist.
   * Everything after this waits for a person.
   */
  useEffect(() => {
    if (step === 'prepare' && !busy && apply.targets.length > 0) void apply.prepare();
  }, [step, busy, apply]);

  const surveyable = estate.profiles.filter((p) => p.fingerprint).map((p) => p.id);

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px 28px' }}>
      <ViewHeading title={t.guided.title} subtitle={t.guided.subtitle} />

      {!estate.supported ? (
        <Card palette={palette}>
          <Lead>{t.guided.desktopOnly}</Lead>
        </Card>
      ) : null}

      <Steps step={step} palette={palette} accent={accent} />

      {step === 'connect' ? (
        <ConnectCard estate={estate} palette={palette} accent={accent} goTo={goTo} />
      ) : null}

      {step === 'look' ? (
        <Card palette={palette}>
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

      {step === 'prepare' ? (
        <Card palette={palette}>
          <Title>{t.guided.prepareTitle}</Title>
          <Lead>{t.guided.prepareBody}</Lead>
        </Card>
      ) : null}

      {step === 'confirm' && apply.report ? (
        <Card palette={palette}>
          <Title>{t.guided.confirmTitle}</Title>
          {apply.writableCount === 0 ? (
            <Lead>{t.guided.nothingToDo}</Lead>
          ) : (
            <>
              <Lead>{t.guided.confirmBody}</Lead>
              <ul
                className="pretty"
                style={{ margin: '12px 0 0 18px', padding: 0, fontSize: 12.5, lineHeight: 1.8 }}
              >
                {summarise(apply.report, t).map((line) => (
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
                  disabled={busy || apply.report.blockers.length > 0}
                  style={vars({ '--btn-bg': accent })}
                  onClick={() => void apply.applyShown()}
                >
                  {apply.busy ? t.guided.applying : t.guided.applyAction(apply.writableCount)}
                </button>
                <button type="button" className="btn-ghost" onClick={() => goTo('planner')}>
                  {t.guided.seeDetail}
                </button>
              </Actions>
            </>
          )}

          {apply.report.blockers.length > 0 ? (
            <div
              className="pretty"
              style={{ fontSize: 11.5, color: palette.warn, marginTop: 12, lineHeight: 1.6 }}
            >
              {t.guided.heldBack}
            </div>
          ) : null}
        </Card>
      ) : null}

      {step === 'done' && apply.run ? (
        <Card palette={palette}>
          <Title>{t.guided.doneTitle}</Title>
          <Lead>
            {t.guided.doneBody(
              apply.run.entries.filter((e) => e.outcome === 'applied').length,
              apply.run.entries.filter((e) => e.outcome === 'failed').length,
            )}
          </Lead>
          <Actions>
            <button type="button" className="btn-ghost" onClick={() => goTo('planner')}>
              {t.guided.seeDetail}
            </button>
            {apply.run.entries.some((e) => e.outcome === 'applied') ? (
              <button type="button" className="btn-ghost" onClick={() => void apply.rollback()}>
                {t.guided.undo}
              </button>
            ) : null}
          </Actions>
        </Card>
      ) : null}

      {apply.error || estate.error ? (
        <Card palette={palette}>
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

  /**
   * `192.168.1.1` is what a person types; an origin is what the native side
   * needs. Assuming https rather than refusing the input: every controller and
   * every hypervisor here serves over it, and a plain host name with no scheme
   * is the overwhelmingly common way to write one down.
   */
  /** The bare host the ssh side needs: no scheme, no port, no path. */
  const hostOf = (raw: string): string =>
    raw
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '')
      .replace(/:\d+$/, '');

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
      <Card palette={palette}>
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
    <Card palette={palette}>
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

/* -------------------------------------------------------------------- bits */

function Steps({ step, palette, accent }: { step: Step; palette: Palette; accent: string }) {
  const t = useT();
  const order: Step[] = ['connect', 'look', 'prepare', 'confirm', 'done'];
  const at = order.indexOf(step);

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '4px 0 18px' }}>
      {order.map((s, i) => (
        <Pill key={s} color={i === at ? accent : i < at ? palette.ok : palette.idle} tight>
          {t.guided.steps[s]}
        </Pill>
      ))}
    </div>
  );
}

function Card({ children, palette }: { children: React.ReactNode; palette: Palette }) {
  void palette;
  return (
    <div className="panel" style={{ padding: '18px 20px', marginBottom: 14, maxWidth: 720 }}>
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
