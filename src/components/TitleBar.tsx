import { useEffect, useState } from 'react';
import { APP_NAME, APP_VERSION } from '@/config';
import { useT, type Dict } from '@/i18n';
import { closeWindow, minimizeWindow, toggleMaximizeWindow } from '@/lib/desktop';
import type { Palette, ThemeName, ThemePref } from '@/lib/palette';
import type { EstateApi } from '@/state/useEstate';
import { AppMark } from './icons';
import { ThemeSwitch } from './ThemeSwitch';
import { Dot } from './ui';

/** What the source chip says, derived from whatever is actually loaded. */
function describeSource(estate: EstateApi, t: Dict): { title: string; detail: string } {
  if (estate.estate.source === 'demo') {
    return { title: t.source.demo, detail: t.source.demoDetail };
  }

  const snapshot = estate.snapshot;
  const parts: string[] = [];
  const node = snapshot?.proxmox?.nodes[0]?.name;
  if (node) parts.push(node);
  if (snapshot?.unifi?.site) parts.push(`${snapshot.unifi.site} site`);

  return {
    title: snapshot?.unifi?.site ?? node ?? t.source.live,
    detail: parts.length > 0 ? parts.join(' + ') : t.source.liveDetail,
  };
}

export function TitleBar({
  estate,
  palette,
  themePref,
  resolvedTheme,
  onThemePref,
  onRunSurvey,
}: {
  estate: EstateApi;
  palette: Palette;
  themePref: ThemePref;
  resolvedTheme: ThemeName;
  onThemePref: (pref: ThemePref) => void;
  onRunSurvey: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const live = estate.estate.source === 'survey';
  const source = describeSource(estate, t);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const choose = (action: () => void) => () => {
    action();
    setOpen(false);
  };

  return (
    <header className="titlebar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }} data-tauri-drag-region>
        <AppMark />
        <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-.01em' }}>{APP_NAME}</div>
        <div
          className="mono"
          style={{
            fontSize: 9.5,
            color: 'var(--text3)',
            border: '1px solid var(--line)',
            borderRadius: 4,
            padding: '1px 5px',
          }}
          title="package.json"
        >
          {APP_VERSION}
        </div>
      </div>

      <div className="popover-anchor">
        <button
          type="button"
          className="chip chip--link"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <Dot color={live ? palette.ok : palette.idle} size={6} />
          <span style={{ fontSize: 11.5 }}>{source.title}</span>
          <span className="mono ellipsis" style={{ fontSize: 11, color: 'var(--text3)', maxWidth: 190 }}>
            {source.detail}
          </span>
          <span style={{ fontSize: 9, color: 'var(--text3)' }}>{open ? '▲' : '▼'}</span>
        </button>

        {open ? (
          <>
            <div className="popover__backdrop" onClick={() => setOpen(false)} />
            <div className="popover" role="menu">
              <div className="sect menu-label">{t.source.heading}</div>

              <button
                type="button"
                className="menu-item"
                role="menuitemradio"
                aria-checked={!live}
                aria-current={!live}
                onClick={choose(estate.useDemo)}
              >
                <Dot color={palette.idle} size={7} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 11.5 }}>{t.source.demoTitle}</span>
                  <span style={{ display: 'block', fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                    {t.source.demoHint}
                  </span>
                </span>
                {!live ? <span style={{ fontSize: 11, color: 'var(--accent)' }}>✓</span> : null}
              </button>

              <button
                type="button"
                className="menu-item"
                role="menuitemradio"
                aria-checked={live}
                aria-current={live}
                disabled={!estate.snapshot}
                onClick={choose(estate.useSurvey)}
              >
                <Dot color={estate.snapshot ? palette.ok : palette.idle} size={7} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 11.5 }}>{t.source.liveTitle}</span>
                  <span style={{ display: 'block', fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                    {estate.snapshot
                      ? t.source.lastRun(estate.snapshot.finishedAt.slice(0, 16).replace('T', ' '))
                      : t.source.neverRan}
                  </span>
                </span>
                {live ? <span style={{ fontSize: 11, color: 'var(--accent)' }}>✓</span> : null}
              </button>

              <div className="menu-sep" />
              <div className="sect menu-label">
                {t.source.profiles} {estate.supported ? `(${estate.profiles.length})` : ''}
              </div>

              {!estate.supported ? (
                <div
                  className="pretty"
                  style={{ padding: '4px 9px 8px', fontSize: 10.5, color: 'var(--text3)', lineHeight: 1.5 }}
                >
                  {t.source.desktopOnly}
                </div>
              ) : estate.profiles.length === 0 ? (
                <div
                  className="pretty"
                  style={{ padding: '4px 9px 8px', fontSize: 10.5, color: 'var(--text3)', lineHeight: 1.5 }}
                >
                  {t.source.noProfiles}
                </div>
              ) : (
                estate.profiles.map((p) => (
                  <div key={p.id} className="menu-item" style={{ cursor: 'default' }}>
                    <Dot color={p.fingerprint ? palette.ok : palette.warn} size={7} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 11.5 }}>{p.label}</span>
                      <span
                        className="mono ellipsis"
                        style={{ display: 'block', fontSize: 9.5, color: 'var(--text3)', marginTop: 2 }}
                      >
                        {p.baseUrl}
                        {p.site ? ` · ${p.site}` : ''}
                      </span>
                    </span>
                  </div>
                ))
              )}

              <div className="menu-sep" />
              <button type="button" className="menu-item" role="menuitem" onClick={choose(onRunSurvey)}>
                <span style={{ flex: 1, fontSize: 11.5 }}>{t.source.manage}</span>
                <span style={{ fontSize: 10, color: 'var(--text3)' }}>→</span>
              </button>
            </div>
          </>
        ) : null}
      </div>

      <div className="titlebar__drag" data-tauri-drag-region />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: '4px 9px',
          border: '1px solid var(--line)',
          borderRadius: 6,
          background: 'var(--panel2)',
        }}
        title={t.app.readOnlyHint}
      >
        <Dot color={palette.ok} size={5} />
        <span style={{ fontSize: 10.5, color: 'var(--text2)', letterSpacing: '.02em' }}>
          {t.app.readOnlySurvey}
        </span>
      </div>

      <button type="button" className="btn-primary" onClick={onRunSurvey}>
        {t.app.runSurvey}
      </button>

      <ThemeSwitch value={themePref} resolved={resolvedTheme} onChange={onThemePref} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 6, color: 'var(--text3)' }}>
        <button
          type="button"
          className="winbtn"
          style={{ fontSize: 12 }}
          title={t.app.minimize}
          aria-label={t.app.minimize}
          onClick={() => void minimizeWindow()}
        >
          –
        </button>
        <button
          type="button"
          className="winbtn"
          style={{ fontSize: 10 }}
          title={t.app.maximize}
          aria-label={t.app.maximize}
          onClick={() => void toggleMaximizeWindow()}
        >
          ▢
        </button>
        <button
          type="button"
          className="winbtn winbtn--close"
          style={{ fontSize: 12 }}
          title={t.app.quit}
          aria-label={t.app.quit}
          onClick={() => void closeWindow()}
        >
          ✕
        </button>
      </div>
    </header>
  );
}
