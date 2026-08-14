import { useState } from 'react';
import { exportGuideHtml } from '@/blueprint/export';
import type { ResolvedBlueprint } from '@/blueprint/model';
import { openTextFile, saveTextFile } from '@/blueprint/store';
import { vars } from '@/lib/css';
import { tint, type Palette } from '@/lib/palette';
import type { CopyApi } from '@/state/useAppState';
import type { BlueprintApi } from '@/state/useBlueprints';
import type { EstateApi } from '@/state/useEstate';
import { useI18n } from '@/i18n';
import { useApply } from '@/state/useApply';
import { Pill } from '../ui';
import { ApplyPanel } from './ApplyPanel';
import { ModulesTab } from './ModulesTab';
import { ParametersTab } from './ParametersTab';
import { PlanTab } from './PlanTab';
import { PortsTab } from './PortsTab';
import { TargetStateTab } from './TargetStateTab';

const TABS = ['modules', 'params', 'ports', 'target', 'plan', 'apply'] as const;
type Tab = (typeof TABS)[number];

const JSON_FILTER = [{ name: 'Blueprint', extensions: ['json'] }];
const HTML_FILTER = [{ name: 'Handbook', extensions: ['html'] }];

function fileSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[áéíóöőúüű]/g, (c) => 'aeiooouuu'['áéíóöőúüű'.indexOf(c)] ?? c)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'blueprint'
  );
}

export function BlueprintView({
  api,
  estate,
  palette,
  accent,
  copy,
}: {
  api: BlueprintApi;
  estate: EstateApi;
  palette: Palette;
  accent: string;
  copy: CopyApi;
}) {
  const { lang, t: tr } = useI18n();
  const [tab, setTab] = useState<Tab>('modules');
  const [notice, setNotice] = useState<string | null>(null);
  const { current, preset, resolved, plan } = api;

  const exportGuide = async () => {
    if (!resolved || !plan || !current) return;
    const html = exportGuideHtml(resolved, plan, lang, tr);
    const path = await saveTextFile(
      `${fileSlug(current.name)}-${tr.blueprint.handbookSuffix}.html`,
      html,
      HTML_FILTER,
    );
    if (path) setNotice(tr.blueprint.handbookSaved(path));
  };

  const exportJson = async () => {
    if (!current) return;
    const path = await saveTextFile(
      `${fileSlug(current.name)}.json`,
      JSON.stringify(current, null, 2),
      JSON_FILTER,
    );
    if (path) setNotice(tr.blueprint.blueprintSaved(path));
  };

  const importJson = async () => {
    const text = await openTextFile(JSON_FILTER);
    if (text) api.importJson(text);
  };

  return (
    <div style={{ flex: 1, display: 'flex', minWidth: 0, minHeight: 0 }}>
      <div
        style={{
          width: 300,
          flex: 'none',
          borderRight: '1px solid var(--line)',
          background: 'var(--panel)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{tr.blueprint.title}</div>
          <div className="pretty" style={{ fontSize: 11, color: 'var(--text2)', marginTop: 3 }}>
            {tr.blueprint.subtitle}
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 10 }}>
          {api.loading ? (
            <div style={{ padding: 12, fontSize: 11.5, color: 'var(--text3)' }}>
              {tr.common.loading}
            </div>
          ) : null}

          {api.blueprints.map((bp) => {
            const active = bp.id === current?.id;
            return (
              <button
                key={bp.id}
                type="button"
                className="tile"
                aria-pressed={active}
                style={vars({
                  '--tile-bg': active ? tint(accent, '14') : 'transparent',
                  '--tile-bc': active ? tint(accent, '66') : 'var(--line)',
                })}
                onClick={() => api.select(bp.id)}
              >
                <div style={{ fontSize: 12.5, fontWeight: 500 }}>{bp.name}</div>
                <div
                  className="mono"
                  style={{ fontSize: 9.5, color: 'var(--text3)', marginTop: 5 }}
                >
                  {bp.households.length > 0
                    ? `${tr.blueprint.householdCount(bp.households.length)} · `
                    : ''}
                  {tr.blueprint.moduleCount(bp.enabledModules.length)}
                </div>
              </button>
            );
          })}
        </div>

        <div
          style={{
            padding: 10,
            borderTop: '1px solid var(--line)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <select
            className="input"
            value=""
            onChange={(e) => {
              if (e.target.value) api.createFrom(e.target.value);
            }}
          >
            <option value="">{tr.blueprint.newFromPreset}</option>
            {api.presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn-ghost" onClick={() => void importJson()}>
            {tr.blueprint.loadFromFile}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
        {!current || !preset || !resolved || !plan ? (
          <div style={{ padding: 40, color: 'var(--text3)', fontSize: 12 }}>
            {api.loading ? tr.common.loading : tr.blueprint.empty}
          </div>
        ) : (
          <>
            <div
              style={{
                flex: 'none',
                padding: '16px 20px 0',
                borderBottom: '1px solid var(--line)',
                background: 'var(--panel)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 16,
                  flexWrap: 'wrap',
                  marginBottom: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 240 }}>
                  <input
                    className="input"
                    value={current.name}
                    onChange={(e) => api.rename(e.target.value)}
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      border: '1px solid transparent',
                      background: 'transparent',
                      padding: '2px 4px',
                      marginLeft: -4,
                    }}
                  />
                  <div
                    className="pretty"
                    style={{
                      fontSize: 11.5,
                      color: 'var(--text2)',
                      marginTop: 4,
                      lineHeight: 1.55,
                      maxWidth: 720,
                    }}
                  >
                    {current.description}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
                    {preset.targets.map((t) => (
                      <Pill key={t} color={palette.idle} tight>
                        {tr.blueprint.targets[t]}
                      </Pill>
                    ))}
                    {resolved.issues.some((i) => i.severity === 'error') ? (
                      <Pill color={palette.bad} tight>
                        {tr.blueprint.issuesShort(
                          resolved.issues.filter((i) => i.severity === 'error').length,
                        )}
                      </Pill>
                    ) : null}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn-primary" onClick={() => void exportGuide()}>
                    {tr.blueprint.exportGuide}
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => void exportJson()}>
                    {tr.blueprint.saveBlueprint}
                  </button>
                  <button type="button" className="btn-ghost" onClick={api.duplicate}>
                    {tr.blueprint.duplicate}
                  </button>
                  {api.blueprints.length > 1 ? (
                    <button
                      type="button"
                      className="btn-ghost"
                      style={{ color: palette.bad }}
                      onClick={() => api.remove(current.id)}
                    >
                      {tr.common.delete}
                    </button>
                  ) : null}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 2 }}>
                {TABS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={tab === t}
                    onClick={() => setTab(t)}
                    style={{
                      padding: '8px 14px',
                      border: 0,
                      borderBottom: `2px solid ${tab === t ? accent : 'transparent'}`,
                      background: 'transparent',
                      color: tab === t ? 'var(--text)' : 'var(--text2)',
                      fontSize: 12,
                      fontWeight: tab === t ? 500 : 400,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {tr.blueprint.tabs[t]}
                    {t === 'plan' ? (
                      <span className="mono" style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 6 }}>
                        {plan.steps.length}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>

            {api.error || notice ? (
              <div
                style={{
                  flex: 'none',
                  padding: '10px 20px',
                  borderBottom: '1px solid var(--line)',
                  background: 'var(--panel2)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  fontSize: 11.5,
                  color: api.error ? palette.bad : 'var(--text2)',
                }}
              >
                <span style={{ flex: 1 }}>{api.error ?? notice}</span>
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    api.clearError();
                    setNotice(null);
                  }}
                >
                  {tr.common.close}
                </button>
              </div>
            ) : null}

            <div style={{ flex: 1, overflow: 'auto', padding: '18px 20px 28px' }}>
              {tab === 'modules' ? <ModulesTab api={api} palette={palette} accent={accent} /> : null}
              {tab === 'params' ? <ParametersTab api={api} palette={palette} /> : null}
              {tab === 'ports' ? (
                <PortsTab
                  api={api}
                  estate={estate}
                  resolved={resolved}
                  palette={palette}
                  accent={accent}
                />
              ) : null}
              {tab === 'target' ? <TargetStateTab resolved={resolved} palette={palette} /> : null}
              {tab === 'plan' ? (
                <PlanTab plan={plan} palette={palette} accent={accent} copy={copy} />
              ) : null}
              {tab === 'apply' ? <ApplyTab resolved={resolved} estate={estate} palette={palette} /> : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Owns the apply state machine.
 *
 * It lives in its own component so the hook is not called from a branch of the
 * parent's render — and so switching away from the tab drops a half-finished
 * confirmation instead of leaving it armed.
 */
function ApplyTab({
  resolved,
  estate,
  palette,
}: {
  resolved: ResolvedBlueprint;
  estate: EstateApi;
  palette: Palette;
}) {
  const apply = useApply({
    resolved,
    snapshot: estate.snapshot,
    profiles: estate.profiles,
  });

  return <ApplyPanel api={apply} palette={palette} />;
}
