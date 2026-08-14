import { useCallback, useEffect, useMemo, useState } from 'react';
import { demoRecommendations, demoRisks } from '@/data/advice';
import type { Dict, Lang } from '@/i18n';
import type { Tone } from '@/lib/palette';
import { loadSession } from '@/lib/session';
import { demoRules, demoSignals, demoZones, ZONE_MATRIX } from '@/data/policy';
import { demoBackups, demoCapacity, demoProfiles, demoScanLog, demoStats } from '@/data/operations';
import { demoNodes, LINKS } from '@/data/topology';
import * as api from '@/survey/client';
import { diffSurveys, type SurveyDiff } from '@/survey/diff';
import { estateFromSnapshot, type Estate } from '@/survey/mapping';
import type {
  EndpointProbe,
  HostKeyProbe,
  Profile,
  SnapshotHeader,
  SurveySnapshot,
} from '@/survey/model';

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
  /** The kept surveys, newest first, for choosing what to compare against. */
  history: SnapshotHeader[];
  /** What moved since the chosen earlier survey, or null while none is chosen. */
  diff: SurveyDiff | null;
  /** Which earlier survey the comparison is against; empty picks the previous. */
  compareWith: string;
  setCompareWith: (id: string) => void;
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
  const [history, setHistory] = useState<SnapshotHeader[]>([]);
  const [compareWith, setCompareWith] = useState('');
  const [earlier, setEarlier] = useState<SurveySnapshot | null>(null);
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

  /*
   * The kept surveys, and the one being compared against.
   *
   * Listing is separate from loading: the list carries only headers, so the
   * picker stays cheap however long the history grows, and the body of an
   * earlier survey is fetched only once one is actually chosen.
   */
  const refreshHistory = useCallback(async () => {
    if (!supported) return;
    try {
      setHistory(await api.listSnapshots());
    } catch (e) {
      fail(e);
    }
  }, [supported, fail]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  // Nothing chosen means the one taken before the current survey.
  const wanted = useMemo(() => {
    if (compareWith) return compareWith;
    const index = history.findIndex((h) => h.id === snapshot?.id);
    return index >= 0 ? (history[index + 1]?.id ?? '') : (history[1]?.id ?? '');
  }, [compareWith, history, snapshot?.id]);

  useEffect(() => {
    if (!supported || !wanted || wanted === snapshot?.id) {
      setEarlier(null);
      return;
    }
    let cancelled = false;
    api
      .snapshotById(wanted)
      .then((s) => {
        if (!cancelled) setEarlier(s);
      })
      .catch(fail);
    return () => {
      cancelled = true;
    };
  }, [supported, wanted, snapshot?.id, fail]);

  const diff = useMemo(
    () => (earlier && snapshot ? diffSurveys(earlier, snapshot, t) : null),
    [earlier, snapshot, t],
  );

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
    history,
    diff,
    compareWith: wanted,
    setCompareWith,
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
        // Back to comparing against whatever came immediately before this run,
        // which is what someone who just pressed the button wants to see.
        setCompareWith('');
        if (result.errors.length > 0) {
          setError(t.survey.partialRun(result.errors.join('; ')));
        }
        await reloadProfiles();
        await refreshHistory();
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
        setHistory([]);
        setCompareWith('');
      } catch (e) {
        fail(e);
      }
    },
  };
}
