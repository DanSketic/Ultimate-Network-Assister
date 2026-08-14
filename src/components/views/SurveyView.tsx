import { useEffect, useState } from 'react';
import { Field } from '@/components/blueprint/bits';
import { useT } from '@/i18n';
import { vars } from '@/lib/css';
import { tint, type Palette } from '@/lib/palette';
import type { EndpointProbe, Profile, ProfileKind, SshFlavour } from '@/survey/model';
import type { EstateApi } from '@/state/useEstate';
import { Dot, Pill, ViewHeading } from '../ui';

/** Product names, deliberately untranslated. */
const KIND_LABELS: Record<ProfileKind, string> = {
  proxmox: 'Proxmox VE',
  unifi: 'UniFi Network',
  ssh: 'SSH',
};

const EXAMPLE_URL: Record<ProfileKind, string> = {
  proxmox: 'https://10.0.1.10:8006',
  unifi: 'https://10.0.1.12',
  ssh: '10.0.1.10',
};

interface Draft {
  kind: ProfileKind;
  label: string;
  baseUrl: string;
  username: string;
  site: string;
  sshEnabled: boolean;
  sshHost: string;
  sshPort: string;
  sshUsername: string;
  sshAuthMethod: 'password' | 'key';
  flavour: SshFlavour;
}

const EMPTY: Draft = {
  kind: 'proxmox',
  label: '',
  baseUrl: '',
  username: '',
  site: '',
  sshEnabled: false,
  sshHost: '',
  sshPort: '22',
  sshUsername: 'root',
  sshAuthMethod: 'password',
  flavour: 'other',
};

/** Where a profile lives, for the one-line summary under its name. */
function addressOf(p: Profile): string {
  const ssh = p.sshEnabled
    ? `ssh ${p.sshUsername}@${p.sshHost}${p.sshPort && p.sshPort !== 22 ? `:${p.sshPort}` : ''}`
    : '';
  if (p.kind === 'ssh') return ssh;
  return [p.baseUrl, ssh].filter(Boolean).join(' · ');
}

export function SurveyView({
  api,
  palette,
  accent,
}: {
  api: EstateApi;
  palette: Palette;
  accent: string;
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [selected, setSelected] = useState<string[]>([]);
  // A profile can have two things to accept and two secrets to set — the API
  // endpoint's certificate and the ssh host key — so both are keyed by which.
  const [probing, setProbing] = useState<string | null>(null);
  const [probe, setProbe] = useState<{ id: string; ssh: boolean; result: EndpointProbe } | null>(
    null,
  );
  const [secretFor, setSecretFor] = useState<{ id: string; ssh: boolean } | null>(null);
  // Editing the ssh half of an existing profile, in place.
  const [sshEdit, setSshEdit] = useState<{
    id: string;
    host: string;
    port: string;
    username: string;
    authMethod: 'password' | 'key';
  } | null>(null);
  const [secret, setSecret] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const t = useT();

  // Anything with an accepted certificate is worth surveying by default.
  useEffect(() => {
    setSelected(api.profiles.filter((p) => p.fingerprint).map((p) => p.id));
  }, [api.profiles]);

  if (!api.supported) {
    return (
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px 28px' }}>
        <ViewHeading title={t.survey.title} subtitle={t.survey.desktopOnlyTitle} />
        <div className="panel" style={{ padding: '18px 20px', maxWidth: 640 }}>
          <div className="pretty" style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
            {t.survey.desktopOnlyBody}
          </div>
        </div>
      </div>
    );
  }

  const addProfile = async () => {
    const isSsh = draft.kind === 'ssh';
    const ssh = isSsh || draft.sshEnabled;
    const label = draft.label.trim() || KIND_LABELS[draft.kind];
    const saved = await api.saveProfile({
      id: `${draft.kind}-${Date.now().toString(36)}`,
      kind: draft.kind,
      label,
      baseUrl: isSsh ? '' : draft.baseUrl.trim(),
      username: isSsh ? '' : draft.username.trim(),
      site: draft.site.trim(),
      fingerprint: null,
      sshEnabled: ssh,
      sshHost: ssh ? draft.sshHost.trim() : '',
      sshPort: ssh ? Number(draft.sshPort) || 22 : 0,
      sshUsername: ssh ? draft.sshUsername.trim() : '',
      sshAuthMethod: ssh ? draft.sshAuthMethod : '',
      sshFingerprint: null,
      flavour: isSsh ? draft.flavour : '',
      createdAt: '',
      lastRun: null,
    });
    if (saved) {
      setDraft(EMPTY);
      setNotice(t.survey.profileAdded(saved.label));
    }
  };

  /**
   * Fetches the fingerprint the far end presents — a certificate over https, a
   * host key over ssh. Neither is trusted as a result; accepting is separate.
   */
  const runProbe = async (profile: Profile, ssh: boolean) => {
    setProbing(`${profile.id}:${ssh}`);
    setProbe(null);
    const result = ssh
      ? await api.probeSsh(profile.sshHost, profile.sshPort, profile.sshFingerprint)
      : await api.probe(profile.baseUrl, profile.fingerprint);
    setProbing(null);
    if (result) setProbe({ id: profile.id, ssh, result });
  };

  const acceptFingerprint = async (profile: Profile, ssh: boolean, fingerprint: string) => {
    const saved = await api.saveProfile(
      ssh ? { ...profile, sshFingerprint: fingerprint } : { ...profile, fingerprint },
    );
    if (saved) {
      setProbe(null);
      setNotice(t.survey.certAccepted(saved.label));
    }
  };

  const openSshEdit = (profile: Profile) => {
    if (sshEdit?.id === profile.id) {
      setSshEdit(null);
      return;
    }
    setSshEdit({
      id: profile.id,
      host: profile.sshHost,
      port: String(profile.sshPort || 22),
      // A sensible starting point, not a claim about the machine.
      username: profile.sshUsername || 'root',
      authMethod: profile.sshAuthMethod === 'key' ? 'key' : 'password',
    });
  };

  /**
   * Saves the ssh half of an existing profile.
   *
   * Moving the address drops the pinned host key: a different host is a
   * different trust decision, and carrying the old key across would silently
   * accept a machine nobody looked at.
   */
  const saveSshEdit = async (profile: Profile) => {
    if (!sshEdit || !sshEdit.host.trim() || !sshEdit.username.trim()) return;
    const port = Number(sshEdit.port) || 22;
    const moved = sshEdit.host.trim() !== profile.sshHost || port !== profile.sshPort;
    const saved = await api.saveProfile({
      ...profile,
      sshEnabled: true,
      sshHost: sshEdit.host.trim(),
      sshPort: port,
      sshUsername: sshEdit.username.trim(),
      sshAuthMethod: sshEdit.authMethod,
      sshFingerprint: moved ? null : profile.sshFingerprint,
    });
    if (saved) {
      setSshEdit(null);
      setNotice(t.survey.sshSaved(saved.label));
    }
  };

  /** Switches ssh off and takes its credential with it. */
  const removeSsh = async (profile: Profile) => {
    const saved = await api.saveProfile({ ...profile, sshEnabled: false });
    if (saved) {
      await api.clearSecret(profile.id, true);
      setSshEdit(null);
      setNotice(t.survey.sshRemoved(saved.label));
    }
  };

  const saveSecret = async (profile: Profile, ssh: boolean) => {
    if (!secret.trim()) return;
    const ok = await api.setSecret(profile.id, secret, ssh);
    // Clear immediately either way; the value must not linger in state.
    setSecret('');
    setSecretFor(null);
    if (ok) setNotice(t.survey.secretStored(profile.label));
  };

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const runnable = selected.filter((id) => api.profiles.find((p) => p.id === id)?.fingerprint);

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px 28px' }}>
      <ViewHeading
        title={t.survey.title}
        subtitle={t.survey.subtitle}
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Pill color={api.estate.source === 'survey' ? palette.ok : palette.idle}>
              {api.estate.source === 'survey' ? t.survey.liveData : t.survey.demoData}
            </Pill>
            {api.snapshot ? (
              <button type="button" className="btn-ghost" onClick={api.useDemo}>
                {t.survey.switchToDemo}
              </button>
            ) : null}
            {api.snapshot && api.estate.source === 'demo' ? (
              <button type="button" className="btn-ghost" onClick={api.useSurvey}>
                {t.survey.switchToLive}
              </button>
            ) : null}
          </div>
        }
      />

      {api.error || notice ? (
        <div
          className="panel"
          style={{
            padding: '11px 14px',
            marginBottom: 16,
            borderColor: api.error ? palette.bad : 'var(--line)',
            display: 'flex',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <span
            className="pretty"
            style={{ flex: 1, fontSize: 11.5, color: api.error ? palette.bad : 'var(--text2)' }}
          >
            {api.error ?? notice}
          </span>
          <button
            type="button"
            className="link"
            onClick={() => {
              api.clearError();
              setNotice(null);
            }}
          >
            {t.common.close}
          </button>
        </div>
      ) : null}

      <div
        style={{ display: 'grid', gridTemplateColumns: '1fr 1.25fr', gap: 16, alignItems: 'start' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="panel" style={{ padding: '15px 16px 6px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              {t.survey.profiles}
            </div>

            {api.profiles.length === 0 ? (
              <div
                className="pretty"
                style={{
                  padding: '16px 0 18px',
                  fontSize: 11.5,
                  color: 'var(--text3)',
                  lineHeight: 1.6,
                }}
              >
                {t.survey.noProfiles}
              </div>
            ) : null}

            {api.profiles.map((p) => {
              const chosen = selected.includes(p.id);
              const showingProbe = probe?.id === p.id;
              // An ssh-only profile has no API to survey, so it is never a
              // survey target — but it can still be accepted and used.
              const surveyable = p.kind !== 'ssh';
              const ready = surveyable ? Boolean(p.fingerprint) : Boolean(p.sshFingerprint);
              return (
                <div key={p.id} style={{ padding: '12px 0', borderTop: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input
                      type="checkbox"
                      checked={chosen && surveyable}
                      disabled={!surveyable || !p.fingerprint}
                      onChange={() => toggle(p.id)}
                      style={{ accentColor: 'var(--accent)' }}
                      aria-label={p.label}
                    />
                    <Dot color={ready ? palette.ok : palette.warn} size={7} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{p.label}</div>
                      <div
                        className="mono ellipsis"
                        style={{ fontSize: 9.5, color: 'var(--text3)', marginTop: 3 }}
                      >
                        {KIND_LABELS[p.kind]} · {addressOf(p)}
                        {p.site ? ` · ${p.site}` : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-ghost"
                      style={{ color: palette.bad }}
                      onClick={() => void api.removeProfile(p.id)}
                    >
                      {t.common.delete}
                    </button>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      marginTop: 9,
                      marginLeft: 27,
                      flexWrap: 'wrap',
                      alignItems: 'center',
                    }}
                  >
                    {surveyable ? (
                      <>
                        <button
                          type="button"
                          className="btn-ghost"
                          disabled={probing === `${p.id}:false`}
                          onClick={() => void runProbe(p, false)}
                        >
                          {probing === `${p.id}:false`
                            ? t.survey.checking
                            : p.fingerprint
                              ? t.survey.recheckCert
                              : t.survey.fetchCert}
                        </button>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => {
                            setSecretFor(
                              secretFor?.id === p.id && !secretFor.ssh
                                ? null
                                : { id: p.id, ssh: false },
                            );
                            setSecret('');
                          }}
                        >
                          {t.survey.setSecret}
                        </button>
                        {p.fingerprint ? (
                          <span className="mono" style={{ fontSize: 9.5, color: 'var(--text3)' }}>
                            {t.survey.certPinned(
                              `${p.fingerprint.slice(0, 8)}…${p.fingerprint.slice(-4)}`,
                            )}
                          </span>
                        ) : (
                          <Pill color={palette.warn} tight>
                            {t.survey.certNotAccepted}
                          </Pill>
                        )}
                      </>
                    ) : null}

                    {/* Every profile can gain or change ssh access here; the
                        new-profile form is not the only way in. */}
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => openSshEdit(p)}
                    >
                      {p.sshEnabled ? t.survey.editSsh : t.survey.addSsh}
                    </button>

                    {p.sshEnabled ? (
                      <>
                        <button
                          type="button"
                          className="btn-ghost"
                          disabled={probing === `${p.id}:true`}
                          onClick={() => void runProbe(p, true)}
                        >
                          {probing === `${p.id}:true`
                            ? t.survey.checking
                            : p.sshFingerprint
                              ? t.survey.recheckHostKey
                              : t.survey.fetchHostKey}
                        </button>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => {
                            setSecretFor(
                              secretFor?.id === p.id && secretFor.ssh
                                ? null
                                : { id: p.id, ssh: true },
                            );
                            setSecret('');
                          }}
                        >
                          {t.survey.setSshSecret}
                        </button>
                        {p.sshFingerprint ? (
                          <Pill color={palette.ok} tight>
                            {t.survey.hostKeyPinned}
                          </Pill>
                        ) : (
                          <Pill color={palette.warn} tight>
                            {t.survey.hostKeyNotAccepted}
                          </Pill>
                        )}
                      </>
                    ) : null}
                  </div>

                  {sshEdit?.id === p.id ? (
                    <div
                      className="soft"
                      style={{ marginTop: 10, marginLeft: 27, padding: '11px 12px' }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                        {t.survey.sshSection}
                      </div>
                      <div
                        className="pretty"
                        style={{
                          fontSize: 10.5,
                          color: 'var(--text3)',
                          lineHeight: 1.5,
                          marginBottom: 11,
                        }}
                      >
                        {t.survey.sshSectionHint}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 10 }}>
                          <Field label={t.survey.sshHost} help={t.survey.sshHostHint}>
                            <input
                              className="input input--mono"
                              value={sshEdit.host}
                              placeholder={EXAMPLE_URL.ssh}
                              onChange={(e) => setSshEdit({ ...sshEdit, host: e.target.value })}
                            />
                          </Field>
                          <Field label={t.survey.sshPort}>
                            <input
                              className="input input--mono"
                              inputMode="numeric"
                              value={sshEdit.port}
                              onChange={(e) => setSshEdit({ ...sshEdit, port: e.target.value })}
                            />
                          </Field>
                        </div>
                        <Field label={t.survey.username} help={t.survey.userHintSsh}>
                          <input
                            className="input input--mono"
                            value={sshEdit.username}
                            onChange={(e) => setSshEdit({ ...sshEdit, username: e.target.value })}
                          />
                        </Field>
                        <Field label={t.survey.sshAuth} help={t.survey.sshAuthHint}>
                          <select
                            className="input"
                            value={sshEdit.authMethod}
                            onChange={(e) =>
                              setSshEdit({
                                ...sshEdit,
                                authMethod: e.target.value as 'password' | 'key',
                              })
                            }
                          >
                            <option value="password">{t.survey.sshAuthPassword}</option>
                            <option value="key">{t.survey.sshAuthKey}</option>
                          </select>
                        </Field>
                      </div>

                      {p.sshEnabled &&
                      p.sshFingerprint &&
                      (sshEdit.host.trim() !== p.sshHost ||
                        (Number(sshEdit.port) || 22) !== p.sshPort) ? (
                        <div
                          className="pretty"
                          style={{
                            fontSize: 10.5,
                            color: palette.warn,
                            marginTop: 10,
                            lineHeight: 1.5,
                          }}
                        >
                          {t.survey.sshHostChanged}
                        </div>
                      ) : null}

                      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn-primary"
                          disabled={!sshEdit.host.trim() || !sshEdit.username.trim()}
                          onClick={() => void saveSshEdit(p)}
                        >
                          {t.common.save}
                        </button>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => setSshEdit(null)}
                        >
                          {t.common.cancel}
                        </button>
                        {p.sshEnabled && p.kind !== 'ssh' ? (
                          <button
                            type="button"
                            className="btn-ghost"
                            style={{ color: palette.bad, marginLeft: 'auto' }}
                            onClick={() => void removeSsh(p)}
                          >
                            {t.survey.removeSsh}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {showingProbe ? (
                    <div
                      className="soft"
                      style={{
                        marginTop: 10,
                        marginLeft: 27,
                        padding: '11px 12px',
                        borderColor: probe.result.changed ? palette.bad : 'var(--line)',
                      }}
                    >
                      <div
                        className="pretty"
                        style={{ fontSize: 11.5, lineHeight: 1.55, color: 'var(--text2)' }}
                      >
                        {probe.result.message}
                      </div>
                      {probe.result.fingerprintDisplay ? (
                        <div
                          className="mono"
                          style={{
                            fontSize: 10,
                            marginTop: 8,
                            wordBreak: 'break-all',
                            color: 'var(--text)',
                          }}
                        >
                          SHA256 {probe.result.fingerprintDisplay}
                        </div>
                      ) : null}
                      {probe.result.reachable &&
                      !(probe.ssh ? p.sshFingerprint : p.fingerprint) ? (
                        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={() =>
                              void acceptFingerprint(p, probe.ssh, probe.result.fingerprint)
                            }
                          >
                            {probe.ssh ? t.survey.hostKeyAccept : t.survey.certAccept}
                          </button>
                          <button type="button" className="btn-ghost" onClick={() => setProbe(null)}>
                            {t.common.cancel}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {secretFor?.id === p.id ? (
                    <div className="soft" style={{ marginTop: 10, marginLeft: 27, padding: '11px 12px' }}>
                      <Field
                        label={
                          secretFor.ssh
                            ? p.sshAuthMethod === 'key'
                              ? t.survey.secretSshKey
                              : t.survey.secretSshPassword
                            : p.kind === 'proxmox'
                              ? t.survey.secretProxmox
                              : t.survey.secretUnifi
                        }
                        help={
                          secretFor.ssh
                            ? p.sshAuthMethod === 'key'
                              ? t.survey.secretHintSshKey
                              : t.survey.secretHintSshPassword
                            : p.kind === 'proxmox'
                              ? t.survey.secretHintProxmox
                              : t.survey.secretHintUnifi
                        }
                      >
                        {secretFor.ssh && p.sshAuthMethod === 'key' ? (
                          // A private key is multi-line PEM; a password box
                          // would mangle it and hide what was pasted.
                          <textarea
                            className="input mono"
                            rows={4}
                            spellCheck={false}
                            autoComplete="off"
                            value={secret}
                            placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                            onChange={(e) => setSecret(e.target.value)}
                            style={{ width: '100%', resize: 'vertical', fontSize: 10.5 }}
                          />
                        ) : (
                          <input
                            className="input"
                            type="password"
                            autoComplete="off"
                            value={secret}
                            onChange={(e) => setSecret(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void saveSecret(p, secretFor.ssh);
                            }}
                          />
                        )}
                      </Field>
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => void saveSecret(p, secretFor.ssh)}
                        >
                          {t.survey.saveSecret}
                        </button>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => {
                            setSecret('');
                            setSecretFor(null);
                          }}
                        >
                          {t.common.cancel}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="panel" style={{ padding: '15px 16px 16px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 11 }}>
              {t.survey.newProfile}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              <Field label={t.survey.system}>
                <select
                  className="input"
                  value={draft.kind}
                  onChange={(e) =>
                    setDraft({ ...draft, kind: e.target.value as ProfileKind, username: '' })
                  }
                >
                  <option value="proxmox">{KIND_LABELS.proxmox}</option>
                  <option value="unifi">{KIND_LABELS.unifi}</option>
                  <option value="ssh">{KIND_LABELS.ssh}</option>
                </select>
              </Field>
              <Field label={t.survey.name}>
                <input
                  className="input"
                  value={draft.label}
                  placeholder={KIND_LABELS[draft.kind]}
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                />
              </Field>

              {draft.kind === 'ssh' ? (
                <Field label={t.survey.sshFlavour} help={t.survey.sshFlavourHint}>
                  <select
                    className="input"
                    value={draft.flavour}
                    onChange={(e) => setDraft({ ...draft, flavour: e.target.value as SshFlavour })}
                  >
                    <option value="proxmox">{KIND_LABELS.proxmox}</option>
                    <option value="unifi">{KIND_LABELS.unifi}</option>
                    <option value="other">{t.survey.sshFlavourOther}</option>
                  </select>
                </Field>
              ) : (
                <>
                  <Field
                    label={t.survey.address}
                    help={t.survey.addressHint(EXAMPLE_URL[draft.kind])}
                  >
                    <input
                      className="input input--mono"
                      value={draft.baseUrl}
                      placeholder={EXAMPLE_URL[draft.kind]}
                      onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
                    />
                  </Field>
                  <Field
                    label={draft.kind === 'proxmox' ? t.survey.tokenId : t.survey.username}
                    help={
                      draft.kind === 'proxmox' ? t.survey.userHintProxmox : t.survey.userHintUnifi
                    }
                  >
                    <input
                      className="input input--mono"
                      value={draft.username}
                      onChange={(e) => setDraft({ ...draft, username: e.target.value })}
                    />
                  </Field>
                  {draft.kind === 'unifi' ? (
                    <Field label={t.survey.site} help={t.survey.siteHint}>
                      <input
                        className="input input--mono"
                        value={draft.site}
                        onChange={(e) => setDraft({ ...draft, site: e.target.value })}
                      />
                    </Field>
                  ) : null}
                </>
              )}

              {/* One machine, one profile: ssh is a section on it, not a
                  second entry with the same address typed again. */}
              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                {draft.kind === 'ssh' ? null : (
                  <label
                    style={{
                      display: 'flex',
                      gap: 9,
                      alignItems: 'flex-start',
                      cursor: 'pointer',
                      marginBottom: draft.sshEnabled ? 12 : 0,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={draft.sshEnabled}
                      onChange={(e) => setDraft({ ...draft, sshEnabled: e.target.checked })}
                      style={{ marginTop: 2, accentColor: 'var(--accent)' }}
                    />
                    <span>
                      <span style={{ fontSize: 12, fontWeight: 500 }}>{t.survey.sshSection}</span>
                      <span
                        className="pretty"
                        style={{
                          display: 'block',
                          fontSize: 10.5,
                          color: 'var(--text3)',
                          marginTop: 3,
                          lineHeight: 1.5,
                        }}
                      >
                        {t.survey.sshSectionHint}
                      </span>
                    </span>
                  </label>
                )}

                {draft.kind === 'ssh' || draft.sshEnabled ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 10 }}>
                      <Field label={t.survey.sshHost} help={t.survey.sshHostHint}>
                        <input
                          className="input input--mono"
                          value={draft.sshHost}
                          placeholder={EXAMPLE_URL.ssh}
                          onChange={(e) => setDraft({ ...draft, sshHost: e.target.value })}
                        />
                      </Field>
                      <Field label={t.survey.sshPort}>
                        <input
                          className="input input--mono"
                          inputMode="numeric"
                          value={draft.sshPort}
                          onChange={(e) => setDraft({ ...draft, sshPort: e.target.value })}
                        />
                      </Field>
                    </div>
                    <Field label={t.survey.username} help={t.survey.userHintSsh}>
                      <input
                        className="input input--mono"
                        value={draft.sshUsername}
                        placeholder="root"
                        onChange={(e) => setDraft({ ...draft, sshUsername: e.target.value })}
                      />
                    </Field>
                    <Field label={t.survey.sshAuth} help={t.survey.sshAuthHint}>
                      <select
                        className="input"
                        value={draft.sshAuthMethod}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            sshAuthMethod: e.target.value as Draft['sshAuthMethod'],
                          })
                        }
                      >
                        <option value="password">{t.survey.sshAuthPassword}</option>
                        <option value="key">{t.survey.sshAuthKey}</option>
                      </select>
                    </Field>
                  </div>
                ) : null}
              </div>

              <div>
                <button
                  type="button"
                  className="btn-primary btn-primary--lg"
                  disabled={
                    draft.kind === 'ssh'
                      ? !draft.sshHost.trim() || !draft.sshUsername.trim()
                      : !draft.baseUrl.trim() ||
                        (draft.sshEnabled &&
                          (!draft.sshHost.trim() || !draft.sshUsername.trim()))
                  }
                  onClick={() => void addProfile()}
                >
                  {t.survey.addProfile}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="panel" style={{ padding: '15px 16px 16px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{t.survey.start}</div>
            <div
              className="pretty"
              style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.6, marginBottom: 12 }}
            >
              {t.survey.startHint}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-primary btn-primary--lg"
                disabled={runnable.length === 0 || api.running}
                onClick={() => void api.run(runnable)}
              >
                {api.running ? t.survey.running : t.survey.startWith(runnable.length)}
              </button>
              {api.snapshot ? (
                <button type="button" className="btn-ghost" onClick={() => void api.discard()}>
                  {t.survey.discard}
                </button>
              ) : null}
            </div>
          </div>

          <Changes api={api} palette={palette} t={t} />

          <div className="panel" style={{ overflow: 'hidden' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                borderBottom: '1px solid var(--line)',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {api.snapshot ? t.survey.lastLog : t.survey.log}
              </div>
              {api.snapshot ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Dot
                    color={api.snapshot.errors.length > 0 ? palette.warn : palette.ok}
                    size={6}
                  />
                  <span style={{ fontSize: 10.5, color: 'var(--text2)' }}>
                    {api.snapshot.errors.length > 0 ? t.survey.partial : t.survey.successful} ·{' '}
                    {api.snapshot.finishedAt.slice(11, 19)}
                  </span>
                </div>
              ) : null}
            </div>

            <div className="mono" style={{ padding: '12px 16px 16px', fontSize: 10.5, lineHeight: 1.9 }}>
              {api.estate.scanLog.length === 0 ? (
                <span style={{ color: 'var(--text3)' }}>{t.survey.neverRan}</span>
              ) : null}
              {api.estate.scanLog.map((entry, i) => (
                <div key={i} style={{ display: 'flex', gap: 12 }}>
                  <span style={{ color: 'var(--text3)', flex: 'none' }}>{entry.time}</span>
                  <span style={{ color: 'var(--accent)', flex: 'none', width: 64 }}>
                    {entry.source}
                  </span>
                  <span style={{ color: 'var(--text2)' }}>{entry.message}</span>
                </div>
              ))}
            </div>

            {api.snapshot && api.snapshot.errors.length > 0 ? (
              <div
                style={{
                  padding: '12px 16px',
                  borderTop: '1px solid var(--line)',
                  background: 'var(--panel2)',
                }}
              >
                {api.snapshot.errors.map((e, i) => (
                  <div
                    key={i}
                    className="pretty"
                    style={{ fontSize: 11, color: palette.warn, lineHeight: 1.6 }}
                  >
                    {e}
                  </div>
                ))}
              </div>
            ) : null}

            <div
              className="pretty"
              style={{
                padding: '14px 16px',
                borderTop: '1px solid var(--line)',
                background: 'var(--panel2)',
                fontSize: 11,
                color: 'var(--text2)',
                lineHeight: 1.6,
              }}
            >
              {t.survey.provenanceNote}
            </div>
          </div>

          {api.snapshot ? (
            <div className="panel" style={{ padding: '15px 16px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 11 }}>
                {t.survey.result}
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))',
                  gap: 10,
                }}
              >
                {[
                  [t.survey.counts.devices, api.snapshot.unifi?.devices.length ?? 0],
                  [t.survey.counts.networks, api.snapshot.unifi?.networks.length ?? 0],
                  [t.survey.counts.ssids, api.snapshot.unifi?.wlans.length ?? 0],
                  [t.survey.counts.rules, api.snapshot.unifi?.firewallRules.length ?? 0],
                  [t.survey.counts.clients, api.snapshot.unifi?.clients.length ?? 0],
                  [t.survey.counts.guests, api.snapshot.proxmox?.guests.length ?? 0],
                  [t.survey.counts.storages, api.snapshot.proxmox?.storages.length ?? 0],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    style={vars({ '--tile-bg': tint(accent, '0f') }, {
                      padding: '10px 11px',
                      borderRadius: 9,
                      border: '1px solid var(--line)',
                      background: 'var(--panel2)',
                    })}
                  >
                    <div style={{ fontSize: 10.5, color: 'var(--text3)' }}>{label}</div>
                    <div className="mono" style={{ fontSize: 16, marginTop: 3 }}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * What moved since an earlier survey.
 *
 * The history was always kept and never read, which left the one question a
 * person cannot answer by looking — what changed while nobody was watching —
 * with nowhere to be asked. Each line carries the measurement rather than
 * describing it: "1000 → 100 Mb/s" says more than any sentence about a port
 * having slowed down.
 */
function Changes({
  api,
  palette,
  t,
}: {
  api: EstateApi;
  palette: Palette;
  t: ReturnType<typeof useT>;
}) {
  if (!api.snapshot) return null;

  const when = (iso: string) => iso.slice(0, 16).replace('T', ' ');
  const earlier = api.history.filter((h) => h.id !== api.snapshot?.id);

  if (earlier.length === 0) {
    return (
      <div className="panel" style={{ padding: '15px 16px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{t.diff.onlyOne}</div>
        <div className="pretty" style={{ fontSize: 11.5, color: 'var(--text2)', lineHeight: 1.6 }}>
          {t.diff.onlyOneBody}
        </div>
      </div>
    );
  }

  const TONE: Record<'bad' | 'warn' | 'good' | 'info', string> = {
    bad: palette.bad,
    warn: palette.warn,
    good: palette.ok,
    info: palette.idle,
  };

  return (
    <div className="panel" style={{ overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          padding: '14px 16px',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{t.diff.title}</div>
          {api.diff ? (
            <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 3 }}>
              {t.diff.subtitle(when(api.diff.from?.at ?? ''))}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          {api.diff && api.diff.changes.length > 0 ? (
            <Pill color={palette.warn} tight>
              {t.diff.countLabel(api.diff.changes.length)}
            </Pill>
          ) : null}
          <label style={{ fontSize: 10.5, color: 'var(--text3)' }}>{t.diff.pick}</label>
          <select
            className="input"
            value={api.compareWith}
            onChange={(e) => api.setCompareWith(e.target.value)}
            style={{ fontSize: 11, padding: '5px 8px', width: 'auto' }}
          >
            {earlier.map((h) => (
              <option key={h.id} value={h.id}>
                {when(h.finishedAt)} · {h.devices + h.guests}
              </option>
            ))}
          </select>
        </div>
      </div>

      {api.diff?.notCompared.map((note) => (
        <div
          key={note}
          className="pretty"
          style={{
            padding: '11px 16px',
            fontSize: 11,
            color: palette.warn,
            borderBottom: '1px solid var(--line)',
            lineHeight: 1.55,
          }}
        >
          {note}
        </div>
      ))}

      {api.diff && api.diff.changes.length === 0 ? (
        <div style={{ padding: '15px 16px' }}>
          <div style={{ fontSize: 12, marginBottom: 5 }}>{t.diff.none}</div>
          <div className="pretty" style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
            {t.diff.noneBody}
          </div>
        </div>
      ) : null}

      {/*
        * Capped for the panel's sake, and the cap is stated. A survey after a
        * rebuild can move hundreds of things, and silently showing the first
        * forty would read as "that was all of it".
        */}
      {(api.diff?.changes ?? []).slice(0, 40).map((change, i) => (
        <div
          key={`${change.where}-${change.what}-${i}`}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 10,
            padding: '10px 16px',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <Dot color={TONE[change.tone]} size={6} style={{ flex: 'none', top: 5 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 12 }}>{change.what}</span>
            <span className="mono" style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 9 }}>
              {change.where}
            </span>
          </div>
          {change.detail ? (
            <div className="mono" style={{ fontSize: 10.5, color: 'var(--text2)', flex: 'none' }}>
              {change.detail}
            </div>
          ) : null}
        </div>
      ))}

      {(api.diff?.changes.length ?? 0) > 40 ? (
        <div style={{ padding: '11px 16px', fontSize: 10.5, color: 'var(--text3)' }}>
          {t.diff.capped((api.diff?.changes.length ?? 0) - 40)}
        </div>
      ) : null}
    </div>
  );
}
