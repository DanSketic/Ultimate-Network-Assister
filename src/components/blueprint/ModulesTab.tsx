import type { BlueprintModule, ModuleGroup } from '@/blueprint/model';
import { useT } from '@/i18n';
import { cx, vars } from '@/lib/css';
import { tint, type Palette } from '@/lib/palette';
import type { BlueprintApi } from '@/state/useBlueprints';
import { CardMotif, ModuleGlyph } from '../icons';

const GROUP_ORDER: ModuleGroup[] = ['overview', 'network', 'server', 'services', 'ops'];

/** Four buckets, so effort is comparable at a glance without reading a number. */
const EFFORT_STEPS = [20, 45, 75];

function effortLevel(minutes: number): number {
  if (minutes <= 0) return 0;
  return EFFORT_STEPS.filter((step) => minutes > step).length + 1;
}

export function ModulesTab({
  api,
  palette,
  accent,
}: {
  api: BlueprintApi;
  palette: Palette;
  accent: string;
}) {
  const t = useT();
  const { current, preset } = api;
  if (!current || !preset) return null;

  const enabled = new Set(current.enabledModules);
  const byId = new Map(preset.modules.map((m) => [m.id, m]));

  const riskColor = (risk: BlueprintModule['risk']) =>
    risk === 'high' ? palette.bad : risk === 'medium' ? palette.warn : palette.idle;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div
        className="pretty"
        style={{ fontSize: 11.5, color: 'var(--text2)', lineHeight: 1.6, maxWidth: 780 }}
      >
        {t.blueprint.modulesNote}
      </div>

      {GROUP_ORDER.map((group) => {
        const modules = preset.modules.filter((m) => m.group === group);
        if (modules.length === 0) return null;
        const on = modules.filter((m) => enabled.has(m.id)).length;

        return (
          <section key={group}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 11 }}>
              <div
                className="module-card__glyph"
                style={vars({ '--glyph': accent }, { width: 26, height: 26, borderRadius: 7 })}
              >
                <ModuleGlyph group={group} size={15} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{t.blueprint.groups[group]}</div>
              <div
                style={{
                  flex: 1,
                  height: 2,
                  borderRadius: 1,
                  background: 'var(--line)',
                  overflow: 'hidden',
                  minWidth: 40,
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${(on / modules.length) * 100}%`,
                    background: accent,
                  }}
                />
              </div>
              <div className="mono" style={{ fontSize: 10.5, color: 'var(--text3)' }}>
                {on} / {modules.length}
              </div>
            </div>

            <div className="module-grid">
              {modules.map((m) => {
                const isOn = enabled.has(m.id);
                const dependents = preset.modules.filter(
                  (o) => (o.requires ?? []).includes(m.id) && enabled.has(o.id),
                );
                const missing = (m.requires ?? []).filter((r) => !enabled.has(r));
                const level = effortLevel(m.minutes);

                return (
                  <button
                    key={m.id}
                    type="button"
                    className={cx(
                      'module-card',
                      !m.optional && 'module-card--locked',
                      !isOn && 'module-card--off',
                    )}
                    aria-pressed={isOn}
                    aria-disabled={!m.optional || undefined}
                    style={vars({
                      '--card-bg': isOn ? tint(accent, '10') : 'transparent',
                      '--card-bc': isOn ? tint(accent, '55') : 'var(--line)',
                      '--stripe': isOn ? riskColor(m.risk) : 'var(--line)',
                      '--glyph': isOn ? accent : 'var(--text3)',
                    })}
                    onClick={() => {
                      if (m.optional) api.toggleModule(m.id);
                    }}
                  >
                    <span className="module-card__stripe" />
                    {isOn ? <CardMotif /> : null}

                    <span className="module-card__head">
                      <span className="module-card__glyph">
                        <ModuleGlyph group={m.group} />
                      </span>

                      <span style={{ flex: 1, minWidth: 0, display: 'block' }}>
                        <span
                          className="mono"
                          style={{ display: 'block', fontSize: 9.5, color: 'var(--text3)' }}
                        >
                          {m.code}.
                        </span>
                        <span
                          style={{
                            display: 'block',
                            fontSize: 12.5,
                            fontWeight: 500,
                            lineHeight: 1.3,
                            marginTop: 3,
                          }}
                        >
                          {m.title}
                        </span>
                      </span>

                      <span
                        className={cx('check-box', isOn && 'check-box--on')}
                        aria-hidden="true"
                        style={{ marginTop: 2 }}
                      >
                        {isOn ? '✓' : ''}
                      </span>
                    </span>

                    <span className="module-card__body">
                      <span
                        className="pretty"
                        style={{
                          display: 'block',
                          fontSize: 11,
                          color: 'var(--text2)',
                          lineHeight: 1.5,
                        }}
                      >
                        {m.summary}
                      </span>

                      {missing.length > 0 ? (
                        <span
                          className="pretty"
                          style={{
                            display: 'block',
                            fontSize: 10.5,
                            color: palette.warn,
                            marginTop: 7,
                            lineHeight: 1.45,
                          }}
                        >
                          {t.blueprint.prerequisite}:{' '}
                          {missing.map((r) => byId.get(r)?.title ?? r).join(', ')}
                        </span>
                      ) : null}

                      {isOn && dependents.length > 0 ? (
                        <span
                          className="pretty"
                          style={{
                            display: 'block',
                            fontSize: 10.5,
                            color: 'var(--text3)',
                            marginTop: 7,
                            lineHeight: 1.45,
                          }}
                        >
                          {t.blueprint.dropsWhenOff}: {dependents.map((d) => d.title).join(', ')}
                        </span>
                      ) : null}
                    </span>

                    <span className="module-card__foot">
                      <span
                        style={{
                          fontSize: 9.5,
                          color: riskColor(m.risk),
                          border: `1px solid ${riskColor(m.risk)}`,
                          borderRadius: 5,
                          padding: '1px 6px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {t.blueprint.risk[m.risk]}
                      </span>

                      {!m.optional ? (
                        <span
                          style={{
                            fontSize: 9.5,
                            color: 'var(--text3)',
                            border: '1px solid var(--line2)',
                            borderRadius: 5,
                            padding: '1px 6px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {t.common.required}
                        </span>
                      ) : null}

                      <span style={{ flex: 1 }} />

                      {m.minutes > 0 ? (
                        <>
                          <span className="effort" aria-hidden="true">
                            {[1, 2, 3, 4].map((i) => (
                              <span
                                key={i}
                                className={cx('effort__tick', i <= level && 'effort__tick--on')}
                              />
                            ))}
                          </span>
                          <span
                            className="mono"
                            style={{ fontSize: 9.5, color: 'var(--text3)', whiteSpace: 'nowrap' }}
                          >
                            {m.minutes}
                            {t.common.minutesShort}
                          </span>
                        </>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
