import { useCallback, useEffect, useMemo, useState } from 'react';
import { demoRecommendations, demoRisks } from '@/data/advice';
import type { Dict, Lang } from '@/i18n';
import type { Tone } from '@/lib/palette';
import { loadSession } from '@/lib/session';
import { demoRules, demoSignals, demoZones, ZONE_MATRIX } from '@/data/policy';
import { demoBackups, demoCapacity, demoProfiles, demoScanLog, demoStats } from '@/data/operations';
import { demoNodes, LINKS } from '@/data/topology';
import * as api from '@/survey/client';
import { estateFromSnapshot, type Estate } from '@/survey/mapping';
import type { EndpointProbe, HostKeyProbe, Profile, SurveySnapshot } from '@/survey/model';

/**
 * The estate the views render.
 *
 * Two sources feed it: the bundled demo fixture, and a live read-only survey.
 * They never mix — a view is either showing measured state or the demo, and
 * says which.
 */
export interface EstateApi {
  estate: Estate;
  mode: 'demo' | 'survey';
  /** Live surveying needs the desktop shell for TLS pinning and credentials. */
  supported: boolean;
  snapshot: SurveySnapshot | null;
  profiles: Profile[];
  loading: boolean;
  running: boolean;
  error: string | null;
  clearError: () => void;

  useDemo: () => void;
  useSurvey: () => void;

  reloadProfiles: () => Promise<void>;
  saveProfile: (profile: Profile) => Promise<Profile | null>;
  removeProfile: (id: string) => Promise<void>;
  /** `ssh` picks the slot: false is the API credential, true is the ssh one. */
  setSecret: (id: string, secret: string, ssh?: boolean) => Promise<boolean>;
  clearSecret: (id: string, ssh?: boolean) => Promise<void>;
  probe: (baseUrl: string, pinned: string | null) => Promise<EndpointProbe | null>;
  /** The ssh counterpart: reads the host key without ever authenticating. */
  probeSsh: (host: string, port: number, pinned: string | null) => Promise<HostKeyProbe | null>;
  run: (profileIds: string[]) => Promise<void>;
  discard: () => Promise<void>;
}

export function demoEstate(lang: Lang, matrixNote: string): Estate {
  const nodes = demoNodes(lang);
  const counts: Record<Tone, number> = { ok: 0, warn: 0, bad: 0, idle: 0 };
  for (const n of nodes) counts[n.status] += 1;

  return {
    source: 'demo',
    nodes,
    links: LINKS,
    zones: demoZones(lang),
    matrix: ZONE_MATRIX,
    matrixNote,
    rules: demoRules(lang),
    signals: demoSignals(lang),
    risks: demoRisks(lang),
    recommendations: demoRecommendations(lang),
    scanLog: demoScanLog(lang),
    profiles: demoProfiles(lang),
    counts,
    capacity: demoCapacity(lang),
    stats: demoStats(lang),
    // The demo fixture carries jobs but no measured evidence behind them; the
    // view reads `source` and says so rather than presenting them as findings.
    backups: {
      jobs: demoBackups(lang),
      unprotected: [],
      guestCount: 0,
      protectedCount: 0,
      newestAgeDays: null,
      verifiable: false,
      stores: [],
    },
  };
}

export function useEstateSource(lang: Lang, t: Dict): EstateApi {
  const supported = api.surveySupported();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [snapshot, setSnapshot] = useState<SurveySnapshot | null>(null);
  const [mode, setMode] = useState<'demo' | 'survey'>('demo');
  const [loading, setLoading] = useState(supported);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fail = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : String(e));
  }, []);

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;

    // Loaded independently on purpose. Profiles are what the user typed and a
    // stale snapshot must never cost them: if the survey cannot be read back,
    // the app opens on the demo estate with the profiles intact.
    api
      .listProfiles()
      .then((p) => {
        if (!cancelled) setProfiles(p);
      })
      .catch(fail)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    api
      .latestSnapshot()
      .then((s) => {
        if (cancelled || !s) return;
        setSnapshot(s);
        // A previous run is the more useful thing to open on — unless the last
        // session was deliberately left on the sample estate, in which case
        // that was a choice and reopening the survey would undo it.
        if (loadSession()?.source !== 'demo') setMode('survey');
      })
      .catch(fail);

    return () => {
      cancelled = true;
    };
  }, [supported, fail]);

  const demo = useMemo(() => demoEstate(lang, t.policy.matrixNoteDemo), [lang, t]);
  const live = useMemo(
    () => (snapshot ? estateFromSnapshot(snapshot, profiles, t) : null),
    [snapshot, profiles, t],
  );

  const estate = mode === 'survey' && live ? live : demo;

  const reloadProfiles = useCallback(async () => {
    if (!supported) return;
    try {
      setProfiles(await api.listProfiles());
    } catch (e) {
      fail(e);
    }
  }, [supported, fail]);

  return {
    estate,
    mode: estate.source,
    supported,
    snapshot,
    profiles,
    loading,
    running,
    error,
    clearError: () => setError(null),

    useDemo: () => setMode('demo'),
    useSurvey: () => setMode('survey'),

    reloadProfiles,

    saveProfile: async (profile) => {
      try {
        const saved = await api.saveProfile(profile);
        setProfiles((prev) => {
          const rest = prev.filter((p) => p.id !== saved.id);
          return [...rest, saved].sort((a, b) => a.label.localeCompare(b.label));
        });
        return saved;
      } catch (e) {
        fail(e);
        return null;
      }
    },

    removeProfile: async (id) => {
      try {
        await api.deleteProfile(id);
        setProfiles((prev) => prev.filter((p) => p.id !== id));
      } catch (e) {
        fail(e);
      }
    },

    setSecret: async (id, secret, ssh = false) => {
      try {
        await api.storeSecret(id, secret, ssh);
        return true;
      } catch (e) {
        fail(e);
        return false;
      }
    },

    clearSecret: async (id, ssh = false) => {
      try {
        await api.deleteSecret(id, ssh);
      } catch (e) {
        fail(e);
      }
    },

    probe: async (baseUrl, pinned) => {
      try {
        return await api.probeEndpoint(baseUrl, pinned);
      } catch (e) {
        fail(e);
        return null;
      }
    },

    probeSsh: async (host, port, pinned) => {
      try {
        return await api.probeSshHost(host, port, pinned);
      } catch (e) {
        fail(e);
        return null;
      }
    },

    run: async (profileIds) => {
      setRunning(true);
      setError(null);
      try {
        const result = await api.runSurvey(profileIds);
        setSnapshot(result);
        setMode('survey');
        if (result.errors.length > 0) {
          setError(t.survey.partialRun(result.errors.join('; ')));
        }
        await reloadProfiles();
      } catch (e) {
        fail(e);
      } finally {
        setRunning(false);
      }
    },

    discard: async () => {
      try {
        await api.clearSnapshots();
        setSnapshot(null);
        setMode('demo');
      } catch (e) {
        fail(e);
      }
    },
  };
}
