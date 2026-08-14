import { useCallback, useEffect, useMemo } from 'react';
import { dict, I18nProvider, useI18n } from '@/i18n';
import { saveSession } from '@/lib/session';
import { BlueprintView } from '@/components/blueprint/BlueprintView';
import { NavRail } from '@/components/NavRail';
import { StatusBar } from '@/components/StatusBar';
import { TitleBar } from '@/components/TitleBar';
import { TopologyView } from '@/components/topology/TopologyView';
import { AdviceView } from '@/components/views/AdviceView';
import { BackupView } from '@/components/views/BackupView';
import { KbView } from '@/components/views/KbView';
import { OverviewView } from '@/components/views/OverviewView';
import { SettingsView } from '@/components/views/SettingsView';
import { SshView } from '@/components/views/SshView';
import { SurveyView } from '@/components/views/SurveyView';
import { DEFAULT_CONFIG, type AppConfig, type InspectorTab, type ViewId } from '@/config';
import { useAppState, useCopyFeedback } from '@/state/useAppState';
import { useBlueprints } from '@/state/useBlueprints';
import { useEstateSource } from '@/state/useEstate';
import { useSsh } from '@/state/useSsh';

/**
 * The provider has to sit above everything that reads the dictionary, and the
 * hooks below all do — so App only resolves the language, and Shell holds the
 * state that depends on it.
 */
export default function App({ config = DEFAULT_CONFIG }: { config?: AppConfig }) {
  const app = useAppState(config);
  const i18n = useMemo(() => ({ lang: app.lang, t: dict(app.lang) }), [app.lang]);

  return (
    <I18nProvider value={i18n}>
      <Shell app={app} config={config} />
    </I18nProvider>
  );
}

function Shell({ app, config }: { app: ReturnType<typeof useAppState>; config: AppConfig }) {
  const {
    state,
    patch,
    palette,
    accent,
    themePref,
    resolvedTheme,
    setThemePref,
    langPref,
    lang,
    setLangPref,
    zoomIn,
    zoomOut,
    zoomFit,
  } = app;
  const i18n = useI18n();
  const estateApi = useEstateSource(lang, i18n.t);
  const copy = useCopyFeedback();
  const blueprints = useBlueprints();
  const ssh = useSsh(estateApi.profiles);
  const estate = estateApi.estate;

  const setView = useCallback((view: ViewId) => patch({ view }), [patch]);
  const setSub = useCallback((sub: 'map' | 'policy') => patch({ sub }), [patch]);
  const setTab = useCallback((tab: InspectorTab) => patch({ tab }), [patch]);
  const setSelected = useCallback((selected: string) => patch({ selected }), [patch]);
  const setHovered = useCallback((hovered: string | null) => patch({ hovered }), [patch]);
  const setPan = useCallback((panX: number, panY: number) => patch({ panX, panY }), [patch]);
  const toggleLegend = useCallback(
    () => patch({ legendOpen: !state.legendOpen }),
    [patch, state.legendOpen],
  );
  const openSurvey = useCallback(() => setView('survey'), [setView]);

  /*
   * Remembers where the user is, so the next start opens here.
   *
   * Written from one place rather than from each hook, because a session is a
   * single picture of the application and three writers to one key would race.
   * Debounced: panning the map changes this on every animation frame, and none
   * of those intermediate positions is worth a write.
   */
  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveSession({
        view: state.view,
        sub: state.sub,
        tab: state.tab,
        selected: state.selected,
        zoom: state.zoom,
        panX: state.panX,
        panY: state.panY,
        rec: state.rec,
        tpl: state.tpl,
        art: state.art,
        cmd: state.cmd,
        legendOpen: state.legendOpen,
        source: estate.source,
        blueprintId: blueprints.current?.id ?? '',
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [state, estate.source, blueprints.current?.id]);

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--app)',
        color: 'var(--text)',
      }}
    >
      <TitleBar
        estate={estateApi}
        palette={palette}
        themePref={themePref}
        resolvedTheme={resolvedTheme}
        onThemePref={setThemePref}
        onRunSurvey={openSurvey}
      />

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <NavRail view={state.view} accent={accent} onSelect={setView} />

        <main style={{ flex: 1, display: 'flex', minWidth: 0, minHeight: 0 }}>
          {state.view === 'topology' ? (
            <TopologyView
              state={state}
              estate={estate}
              palette={palette}
              accent={accent}
              copy={copy}
              showLogical={config.showLogicalLinks}
              showEstimated={config.showEstimated}
              animate={config.animateTraffic}
              onSub={setSub}
              onTab={setTab}
              onSelect={setSelected}
              onHover={setHovered}
              onPan={setPan}
              onToggleLegend={toggleLegend}
              onZoomIn={zoomIn}
              onZoomOut={zoomOut}
              onZoomFit={zoomFit}
            />
          ) : null}

          {state.view === 'overview' ? (
            <OverviewView
              estate={estate}
              palette={palette}
              accent={accent}
              onOpenAdvice={() => setView('advice')}
            />
          ) : null}

          {state.view === 'survey' ? (
            <SurveyView api={estateApi} palette={palette} accent={accent} />
          ) : null}

          {state.view === 'advice' ? (
            <AdviceView
              estate={estate}
              palette={palette}
              accent={accent}
              selectedId={state.rec}
              onSelect={(rec) => patch({ rec })}
              copy={copy}
            />
          ) : null}

          {state.view === 'backup' ? <BackupView estate={estate} palette={palette} /> : null}

          {state.view === 'planner' ? (
            <BlueprintView
              api={blueprints}
              estate={estateApi}
              palette={palette}
              accent={accent}
              copy={copy}
            />
          ) : null}

          {state.view === 'ssh' ? (
            <SshView api={ssh} palette={palette} accent={accent} copy={copy} />
          ) : null}

          {state.view === 'kb' ? (
            <KbView
              accent={accent}
              copy={copy}
              selectedIndex={state.art}
              onSelect={(art) => patch({ art })}
            />
          ) : null}

          {state.view === 'settings' ? (
            <SettingsView
              themePref={themePref}
              resolvedTheme={resolvedTheme}
              onThemePref={setThemePref}
              langPref={langPref}
              lang={lang}
              onLangPref={setLangPref}
            />
          ) : null}
        </main>
      </div>

      <StatusBar palette={palette} estate={estate} />
    </div>
  );
}
