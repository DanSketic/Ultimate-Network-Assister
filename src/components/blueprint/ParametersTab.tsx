import { useState } from 'react';
import type { ParamDef, ParamValue } from '@/blueprint/model';
import { slugify } from '@/blueprint/resolve';
import { useT } from '@/i18n';
import type { Palette } from '@/lib/palette';
import type { BlueprintApi } from '@/state/useBlueprints';
import { Field } from './bits';

export function ParametersTab({ api, palette }: { api: BlueprintApi; palette: Palette }) {
  const t = useT();
  const { current, preset } = api;
  const [newHousehold, setNewHousehold] = useState('');
  if (!current || !preset) return null;

  const enabled = new Set(current.enabledModules);
  // A parameter that belongs to a switched-off module has nothing to affect.
  const visible = preset.params.filter((p) => !p.moduleId || enabled.has(p.moduleId));

  const groups: string[] = [];
  for (const p of visible) if (!groups.includes(p.group)) groups.push(p.group);

  const addHousehold = () => {
    const name = newHousehold.trim();
    if (!name) return;
    api.addHouseholdNamed(name);
    setNewHousehold('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 900 }}>
      {preset.householdsEditable ? (
        <section>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              marginBottom: 4,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600 }}>{t.blueprint.households}</div>
            <div className="mono" style={{ fontSize: 10.5, color: 'var(--text3)' }}>
              {t.blueprint.householdCount(current.households.length)}
            </div>
          </div>
          <div
            className="pretty"
            style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.55, marginBottom: 11 }}
          >
            {t.blueprint.householdsNote}
          </div>

          <div className="panel" style={{ overflow: 'hidden' }}>
            {current.households.map((h) => (
              <div
                key={h.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.4fr 1fr 0.8fr 0.8fr 0.8fr auto',
                  gap: 10,
                  padding: '11px 14px',
                  borderBottom: '1px solid var(--line)',
                  alignItems: 'end',
                }}
              >
                <Field label={t.blueprint.householdName}>
                  <input
                    className="input"
                    value={h.name}
                    onChange={(e) =>
                      api.updateHousehold(h.id, {
                        name: e.target.value,
                        slug: slugify(e.target.value),
                      })
                    }
                  />
                </Field>
                <Field label={t.blueprint.householdSlug}>
                  <input
                    className="input input--mono"
                    value={h.slug}
                    onChange={(e) => api.updateHousehold(h.id, { slug: e.target.value.toUpperCase() })}
                  />
                </Field>
                <Field label={t.blueprint.householdClientVlan}>
                  <input
                    className="input input--mono"
                    type="number"
                    value={h.clientVlan}
                    onChange={(e) => api.updateHousehold(h.id, { clientVlan: Number(e.target.value) })}
                  />
                </Field>
                <Field label={t.blueprint.householdIotVlan}>
                  <input
                    className="input input--mono"
                    type="number"
                    value={h.iotVlan}
                    onChange={(e) => api.updateHousehold(h.id, { iotVlan: Number(e.target.value) })}
                  />
                </Field>
                <Field label={t.blueprint.householdGuestVlan}>
                  <input
                    className="input input--mono"
                    type="number"
                    value={h.guestVlan}
                    onChange={(e) => api.updateHousehold(h.id, { guestVlan: Number(e.target.value) })}
                  />
                </Field>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ color: palette.bad, borderColor: 'var(--line)' }}
                  onClick={() => api.removeHousehold(h.id)}
                >
                  {t.common.delete}
                </button>
              </div>
            ))}

            <div
              style={{
                display: 'flex',
                gap: 10,
                padding: '12px 14px',
                alignItems: 'center',
              }}
            >
              <input
                className="input"
                placeholder={t.blueprint.newHousehold}
                value={newHousehold}
                style={{ maxWidth: 260 }}
                onChange={(e) => setNewHousehold(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addHousehold();
                }}
              />
              <button type="button" className="btn-primary" onClick={addHousehold}>
                {t.common.add}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {groups.map((group) => (
        <section key={group}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 11 }}>{group}</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))',
              gap: 14,
            }}
          >
            {visible
              .filter((p) => p.group === group)
              .map((p) => (
                <ParamInput
                  key={p.id}
                  def={p}
                  value={current.params[p.id] ?? p.default}
                  onChange={(v) => api.setParam(p.id, v)}
                />
              ))}
          </div>
        </section>
      ))}

      <div>
        <button type="button" className="btn-ghost" onClick={api.resetParams}>
          {t.blueprint.resetParams}
        </button>
      </div>
    </div>
  );
}

function ParamInput({
  def,
  value,
  onChange,
}: {
  def: ParamDef;
  value: ParamValue;
  onChange: (value: ParamValue) => void;
}) {
  if (def.type === 'boolean') {
    const on = value === true;
    return (
      <label
        className="soft"
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'flex-start',
          padding: '11px 12px',
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => onChange(e.target.checked)}
          style={{ marginTop: 2, accentColor: 'var(--accent)' }}
        />
        <span style={{ flex: 1 }}>
          <span style={{ fontSize: 11.5 }}>{def.label}</span>
          {def.help ? <span className="field__help">{def.help}</span> : null}
        </span>
      </label>
    );
  }

  if (def.type === 'enum') {
    return (
      <Field label={def.label} help={def.help}>
        <select className="input" value={String(value)} onChange={(e) => onChange(e.target.value)}>
          {(def.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
    );
  }

  const numeric = def.type === 'number' || def.type === 'vlan';
  const mono = numeric || def.type === 'ipv4' || def.type === 'cidr';

  return (
    <Field label={def.unit ? `${def.label} (${def.unit})` : def.label} help={def.help}>
      <input
        className={mono ? 'input input--mono' : 'input'}
        type={numeric ? 'number' : 'text'}
        value={String(value)}
        min={def.min}
        max={def.max}
        onChange={(e) => onChange(numeric ? Number(e.target.value) : e.target.value)}
      />
    </Field>
  );
}
