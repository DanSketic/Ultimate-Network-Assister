import type { CSSProperties, ReactNode } from 'react';
import { useT, type Lang, type LangPref } from '@/i18n';
import { cx } from '@/lib/css';
import type { ThemeName, ThemePref } from '@/lib/palette';
import { LanguageSwitch } from '../LanguageSwitch';
import { ThemeSwitch } from '../ThemeSwitch';

export function SettingsView({
  themePref,
  resolvedTheme,
  onThemePref,
  langPref,
  lang,
  onLangPref,
}: {
  themePref: ThemePref;
  resolvedTheme: ThemeName;
  onThemePref: (pref: ThemePref) => void;
  langPref: LangPref;
  lang: Lang;
  onLangPref: (pref: LangPref) => void;
}) {
  const t = useT();

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px 30px 32px' }}>
      <div style={{ maxWidth: 720 }}>
        <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-.01em' }}>
          {t.settings.title}
        </div>

        <Group title={t.settings.appearance} style={{ marginTop: 18 }}>
          <Row title={t.settings.colorScheme} hint={t.settings.colorSchemeHint} divider>
            <ThemeSwitch value={themePref} resolved={resolvedTheme} onChange={onThemePref} />
          </Row>
          <Row title={t.settings.language} hint={t.settings.languageHint}>
            <LanguageSwitch value={langPref} resolved={lang} onChange={onLangPref} />
          </Row>
        </Group>

        <Group title={t.settings.security} style={{ marginTop: 16 }}>
          <Row title={t.settings.forceReadOnly} hint={t.settings.forceReadOnlyHint} divider>
            <Switch on />
          </Row>
          <Row title={t.settings.hostKeyRequired} hint={t.settings.hostKeyRequiredHint} divider>
            <Switch on />
          </Row>
          <Row title={t.settings.secretStorage} hint={t.settings.secretStorageHint}>
            <ReadOnlyValue>Windows Credential Manager</ReadOnlyValue>
          </Row>
        </Group>

        <Group title={t.settings.dataHandling} style={{ marginTop: 16 }}>
          <Row title={t.settings.telemetry} hint={t.settings.telemetryHint} divider>
            <Switch on={false} />
          </Row>
          <Row title={t.settings.surveyStorage} hint={t.settings.surveyStorageHint}>
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--text2)' }}>
              %LOCALAPPDATA%\NetworkAssister
            </span>
          </Row>
        </Group>
      </div>
    </div>
  );
}

function Group({
  title,
  children,
  style,
}: {
  title: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <section className="panel" style={{ overflow: 'hidden', ...style }}>
      <div
        style={{
          padding: '13px 16px',
          borderBottom: '1px solid var(--line)',
          fontSize: 12.5,
          fontWeight: 600,
        }}
      >
        {title}
      </div>
      {children}
    </section>
  );
}

function Row({
  title,
  hint,
  children,
  divider,
}: {
  title: string;
  hint: string;
  children: ReactNode;
  divider?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '14px 16px',
        borderBottom: divider ? '1px solid var(--line)' : undefined,
      }}
    >
      <div>
        <div style={{ fontSize: 12 }}>{title}</div>
        <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 3 }}>{hint}</div>
      </div>
      {children}
    </div>
  );
}

function ReadOnlyValue({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        fontSize: 11,
        color: 'var(--text2)',
        border: '1px solid var(--line)',
        borderRadius: 7,
        padding: '6px 12px',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

/** Status indicator, not a control: these are enforced by the application. */
function Switch({ on }: { on: boolean }) {
  const t = useT();
  return (
    <div
      className={cx('switch', on ? 'switch--on' : 'switch--off')}
      role="img"
      aria-label={on ? t.settings.on : t.settings.off}
    >
      <div className="switch__knob" style={{ background: on ? '#fff' : 'var(--text3)' }} />
    </div>
  );
}
