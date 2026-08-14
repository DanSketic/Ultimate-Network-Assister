import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildPlan } from '@/blueprint/plan';
import { findPreset, presets, starterBlueprints } from '@/blueprint/registry';
import { dict, LANGS, useI18n } from '@/i18n';
import { loadSession } from '@/lib/session';
import { addHousehold, createBlueprint, resolveBlueprint, withDefaults } from '@/blueprint/resolve';
import {
  loadBlueprints,
  parseBlueprint,
  persistBlueprint,
  removeBlueprint,
} from '@/blueprint/store';
import type {
  Blueprint,
  BlueprintPreset,
  Household,
  ParamValue,
  PortAssignment,
  Plan,
  ResolvedBlueprint,
} from '@/blueprint/model';

export interface BlueprintApi {
  blueprints: Blueprint[];
  /** Presets in the active language, for the "new blueprint" menu. */
  presets: BlueprintPreset[];
  current?: Blueprint;
  preset?: BlueprintPreset;
  resolved?: ResolvedBlueprint;
  plan?: Plan;
  loading: boolean;
  /** Last store or import failure, for the view to surface. */
  error: string | null;
  clearError: () => void;

  select: (id: string) => void;
  createFrom: (presetId: string) => void;
  duplicate: () => void;
  remove: (id: string) => void;
  rename: (name: string) => void;

  toggleModule: (moduleId: string) => void;
  setParam: (paramId: string, value: ParamValue) => void;
  resetParams: () => void;

  /** Replaces the whole port layout — used by the import-from-survey button. */
  setPorts: (ports: PortAssignment[]) => void;
  addPort: () => void;
  updatePort: (id: string, patch: Partial<PortAssignment>) => void;
  removePort: (id: string) => void;

  addHouseholdNamed: (name: string) => void;
  updateHousehold: (id: string, patch: Partial<Household>) => void;
  removeHousehold: (id: string) => void;

  importJson: (json: string) => void;
}

const SAVE_DEBOUNCE_MS = 400;

export function useBlueprints(): BlueprintApi {
  const { lang, t } = useI18n();
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pending = useRef(new Map<string, Blueprint>());
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef<Blueprint[]>([]);
  latest.current = blueprints;

  // The starter is seeded once, in whatever language was active at first run;
  // renaming it afterwards is the user's call, so language changes leave it be.
  const starterRef = useRef({ lang, t });
  starterRef.current = { lang, t };

  useEffect(() => {
    let cancelled = false;

    loadBlueprints()
      .then((stored) => {
        if (cancelled) return;
        const seed = starterRef.current;
        const list = stored.length > 0 ? stored : starterBlueprints(seed.lang, seed.t);
        setBlueprints(list);
        // Back to whichever blueprint was open, when it is still there.
        const wanted = loadSession()?.blueprintId;
        setSelectedId(
          (wanted && list.some((bp) => bp.id === wanted) ? wanted : list[0]?.id) ?? '',
        );
        // Seed the store on first run so the starter survives a restart.
        if (stored.length === 0) {
          for (const bp of list) void persistBlueprint(bp, list);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /** Queues a write; edits arrive per keystroke, writes should not. */
  const scheduleSave = useCallback((blueprint: Blueprint) => {
    pending.current.set(blueprint.id, blueprint);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const queued = [...pending.current.values()];
      pending.current.clear();
      for (const bp of queued) {
        persistBlueprint(bp, latest.current).catch((e: unknown) => {
          setError(e instanceof Error ? e.message : String(e));
        });
      }
    }, SAVE_DEBOUNCE_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const available = useMemo(() => presets(lang), [lang]);

  /**
   * Every language's wording for each parameter's default value.
   *
   * Presets are written per language rather than translated, so a text field
   * left alone holds whatever the language it was created in called it. That
   * is how the app's own words end up sitting in an English form in Hungarian.
   * Knowing all the spellings of a default is what makes it safe to swap: a
   * value matching one of them was never typed by anyone.
   */
  const defaultsInAnyLanguage = useMemo(() => {
    const spellings = new Map<string, Set<ParamValue>>();
    const remember = (key: string, value: ParamValue) => {
      const seen = spellings.get(key) ?? new Set<ParamValue>();
      seen.add(value);
      spellings.set(key, seen);
    };
    for (const other of LANGS) {
      for (const preset of presets(other)) {
        for (const param of preset.params) remember(`${preset.id}:${param.id}`, param.default);
        // Household names are seeded the same way and answer the same question.
        preset.households.forEach((h, i) => remember(`${preset.id}:household:${i}`, h.name));
      }
    }
    return spellings;
  }, []);

  /**
   * Puts the interface language into the form fields.
   *
   * Two different things, deliberately kept apart. A parameter still holding
   * one of its defaults was never filled in by anyone, so it follows the
   * interface language whatever else has been edited — that is the wording the
   * app chose, not the user's. The blueprint's own name and its households are
   * the app's only while it is untouched; the first edit hands them over, and
   * from then on they are the user's to change.
   */
  const localise = useCallback(
    (bp: Blueprint): Blueprint => {
      const from = available.find((p) => p.id === bp.presetId);
      if (!from) return bp;

      const params: Record<string, ParamValue> = { ...bp.params };
      for (const param of from.params) {
        const held = params[param.id];
        if (held === undefined || held === param.default) continue;
        if (defaultsInAnyLanguage.get(`${from.id}:${param.id}`)?.has(held)) {
          params[param.id] = param.default;
        }
      }

      // A household still carrying a seeded name has not been named by anyone
      // either, so it moves with the interface for the same reason.
      const households = bp.households.map((h, i) => {
        const seeded = from.households[i];
        if (!seeded || !defaultsInAnyLanguage.get(`${from.id}:household:${i}`)?.has(h.name)) {
          return h;
        }
        return { ...h, name: seeded.name, slug: seeded.slug };
      });

      // The blueprint's own title, on the same test: a name nobody has changed
      // is still one of the app's, whichever language it was written in.
      const untitled = LANGS.some((other) => dict(other).blueprint.starterName === bp.name);
      const named =
        bp.source === 'preset' || untitled
          ? { name: t.blueprint.starterName, description: t.blueprint.starterDescription }
          : {};

      return { ...bp, params, households, ...named };
    },
    [available, defaultsInAnyLanguage, t],
  );

  const mutate = useCallback(
    (fn: (bp: Blueprint) => Blueprint) => {
      setBlueprints((prev) => {
        const next = prev.map((bp) => {
          if (bp.id !== selectedId) return bp;
          // Edit what the user is looking at, and hand the blueprint over.
          const updated = {
            ...fn(localise(bp)),
            source: 'user' as const,
            updatedAt: new Date().toISOString(),
          };
          scheduleSave(updated);
          return updated;
        });
        latest.current = next;
        return next;
      });
    },
    [selectedId, scheduleSave, localise],
  );

  const shown = useMemo(() => blueprints.map(localise), [blueprints, localise]);
  const current = shown.find((b) => b.id === selectedId);
  const preset = current ? available.find((p) => p.id === current.presetId) : undefined;

  const resolved = useMemo(
    () => (current && preset ? resolveBlueprint(current, preset, t) : undefined),
    [current, preset, t],
  );
  const plan = useMemo(() => (resolved ? buildPlan(resolved, t) : undefined), [resolved, t]);

  const addNew = useCallback(
    (blueprint: Blueprint) => {
      setBlueprints((prev) => {
        const next = [blueprint, ...prev];
        latest.current = next;
        return next;
      });
      setSelectedId(blueprint.id);
      scheduleSave(blueprint);
    },
    [scheduleSave],
  );

  return {
    blueprints: shown,
    presets: available,
    current,
    preset,
    resolved,
    plan,
    loading,
    error,
    clearError: () => setError(null),

    select: setSelectedId,

    createFrom: (presetId) => {
      const p = available.find((x) => x.id === presetId);
      if (!p) return;
      addNew(createBlueprint(p));
    },

    duplicate: () => {
      if (!current || !preset) return;
      const copy = createBlueprint(preset, t.blueprint.copyOf(current.name));
      copy.households = current.households.map((h) => ({ ...h }));
      copy.params = { ...current.params };
      copy.enabledModules = [...current.enabledModules];
      addNew(copy);
    },

    remove: (id) => {
      setBlueprints((prev) => {
        const next = prev.filter((b) => b.id !== id);
        latest.current = next;
        void removeBlueprint(id, next);
        if (id === selectedId) setSelectedId(next[0]?.id ?? '');
        return next;
      });
    },

    rename: (name) => mutate((bp) => ({ ...bp, name })),

    toggleModule: (moduleId) =>
      mutate((bp) => {
        const on = bp.enabledModules.includes(moduleId);
        if (on) {
          // Dropping a module also drops anything that depended on it, so the
          // checkbox never leaves the blueprint in a state resolve has to fix.
          const dependents = (preset?.modules ?? [])
            .filter((m) => (m.requires ?? []).includes(moduleId))
            .map((m) => m.id);
          const drop = new Set([moduleId, ...dependents]);
          return { ...bp, enabledModules: bp.enabledModules.filter((id) => !drop.has(id)) };
        }
        // Enabling pulls in what it needs.
        const module = preset?.modules.find((m) => m.id === moduleId);
        const add = new Set([moduleId, ...(module?.requires ?? [])]);
        return { ...bp, enabledModules: [...new Set([...bp.enabledModules, ...add])] };
      }),

    setParam: (paramId, value) =>
      mutate((bp) => ({ ...bp, params: { ...bp.params, [paramId]: value } })),

    resetParams: () =>
      mutate((bp) => (preset ? { ...bp, params: withDefaults(preset, {}) } : bp)),

    setPorts: (ports) => mutate((bp) => ({ ...bp, ports })),

    addPort: () =>
      mutate((bp) => {
        // A new row lands on the device the last one was on: ports are entered
        // switch by switch, not scattered.
        const last = bp.ports[bp.ports.length - 1];
        return {
          ...bp,
          ports: [
            ...bp.ports,
            {
              id: `port-${Date.now().toString(36)}-${bp.ports.length}`,
              device: last?.device ?? '',
              idx: (last?.idx ?? 0) + 1,
              label: '',
              role: 'access' as const,
              nativeVlan: 0,
              poe: false,
            },
          ],
        };
      }),

    updatePort: (id, patch) =>
      mutate((bp) => ({
        ...bp,
        ports: bp.ports.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      })),

    removePort: (id) => mutate((bp) => ({ ...bp, ports: bp.ports.filter((p) => p.id !== id) })),

    addHouseholdNamed: (name) =>
      mutate((bp) =>
        preset ? { ...bp, households: [...bp.households, addHousehold(bp, preset, name)] } : bp,
      ),

    updateHousehold: (id, patch) =>
      mutate((bp) => ({
        ...bp,
        households: bp.households.map((h) => (h.id === id ? { ...h, ...patch } : h)),
      })),

    removeHousehold: (id) =>
      mutate((bp) => ({ ...bp, households: bp.households.filter((h) => h.id !== id) })),

    importJson: (json) => {
      try {
        const bp = parseBlueprint(json, t.blueprint.importError);
        if (!findPreset(bp.presetId, lang)) {
          throw new Error(t.blueprint.unknownPreset(bp.presetId));
        }
        addNew(bp);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
  };
}
