import { useCallback, useMemo, useState } from 'react';
import * as api from '@/apply/client';
import { compileOperations } from '@/apply/compile';
import { dryRun, writableDiffs } from '@/apply/dryRun';
import {
  gateBlockers,
  type ApplyGates,
  type ApplyRun,
  type DryRunReport,
} from '@/apply/model';
import type { ResolvedBlueprint } from '@/blueprint/model';
import { useT } from '@/i18n';
import { isDesktop } from '@/lib/desktop';
import type { Profile, SurveySnapshot } from '@/survey/model';

/**
 * Drives the write path: backup → dry run → confirm → apply → rollback.
 *
 * The order is enforced here and again on the native side. Anything that
 * invalidates a review — a new survey, a changed blueprint, a fresh dry run —
 * drops the confirmation, so a stale "yes" can never authorise a write.
 */
export interface ApplyApi {
  supported: boolean;
  /** UniFi profiles with an accepted certificate. */
  targets: Profile[];
  profileId: string | null;
  setProfileId: (id: string) => void;

  gates: ApplyGates;
  blockers: string[];
  report: DryRunReport | null;
  run: ApplyRun | null;
  busy: string | null;
  error: string | null;
  clearError: () => void;

  operationCount: number;
  writableCount: number;

  takeBackup: () => Promise<void>;
  review: () => void;
  confirm: () => void;
  unconfirm: () => void;
  apply: () => Promise<void>;
  rollback: () => Promise<void>;
}

const NO_GATES: ApplyGates = {
  backup: { ready: false },
  dryRun: { ready: false },
  confirmed: { ready: false },
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export function useApply(input: {
  resolved: ResolvedBlueprint;
  snapshot: SurveySnapshot | null;
  profiles: Profile[];
}): ApplyApi {
  const { resolved, snapshot, profiles } = input;
  const t = useT();

  const targets = useMemo(
    () => profiles.filter((p) => p.kind === 'unifi' && p.fingerprint),
    [profiles],
  );

  const [profileId, setProfileIdRaw] = useState<string | null>(null);
  const [gates, setGates] = useState<ApplyGates>(NO_GATES);
  const [report, setReport] = useState<DryRunReport | null>(null);
  const [run, setRun] = useState<ApplyRun | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = targets.find((p) => p.id === profileId) ?? targets[0] ?? null;

  const operations = useMemo(() => compileOperations(resolved), [resolved]);

  /** Any change to what is being applied invalidates the review. */
  const invalidate = useCallback(() => {
    setReport(null);
    setGates((g) => ({ ...g, dryRun: { ready: false }, confirmed: { ready: false } }));
  }, []);

  const setProfileId = useCallback(
    (id: string) => {
      setProfileIdRaw(id);
      // A different controller means a different live state.
      setGates(NO_GATES);
      setReport(null);
      setRun(null);
    },
    [],
  );

  const fail = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : String(e));
  }, []);

  const takeBackup = useCallback(async () => {
    if (!selected) return;
    setBusy(t.apply.busyBackup);
    setError(null);
    try {
      const result = await api.takeSiteBackup(selected.id);
      setGates((g) => ({
        ...g,
        backup: { ready: true, path: result.path, takenAt: result.takenAt },
        // A new backup does not invalidate a review, but a review made before
        // it did not have one, so the confirmation is dropped anyway.
        confirmed: { ready: false },
      }));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }, [selected, fail, t]);

  const review = useCallback(() => {
    if (!selected) return;
    setError(null);
    const next = dryRun(
      {
        operations,
        snapshot: { id: snapshot?.id ?? '', unifi: snapshot?.unifi ?? null },
        controllerHost: hostOf(selected.baseUrl),
      },
      t.apply.blocker,
    );
    setReport(next);
    setGates((g) => ({
      ...g,
      dryRun: { ready: next.blockers.length === 0, token: next.token, createdAt: next.createdAt },
      confirmed: { ready: false },
    }));
  }, [operations, snapshot, selected, t]);

  const confirm = useCallback(() => {
    if (!report || report.blockers.length > 0) return;
    setGates((g) => ({ ...g, confirmed: { ready: true, token: report.token } }));
  }, [report]);

  const unconfirm = useCallback(() => {
    setGates((g) => ({ ...g, confirmed: { ready: false } }));
  }, []);

  const applyNow = useCallback(async () => {
    if (!selected || !report) return;
    const blockers = gateBlockers(gates, t.apply.blocker);
    if (blockers.length > 0) {
      setError(blockers.join(' '));
      return;
    }

    setBusy(t.apply.busyApply);
    setError(null);
    try {
      const result = await api.applyOperations({
        profileId: selected.id,
        dryRunToken: report.token,
        confirmToken: gates.confirmed.token ?? '',
        backupPath: gates.backup.path ?? '',
        diffs: writableDiffs(report),
      });
      setRun(result);
      // One confirmation authorises one run.
      setGates((g) => ({ ...g, confirmed: { ready: false } }));
      if (result.abortedReason) {
        setError(t.apply.aborted(result.abortedReason));
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }, [selected, report, gates, fail, t]);

  const rollback = useCallback(async () => {
    if (!selected || !run) return;
    setBusy(t.apply.busyRollback);
    setError(null);
    try {
      setRun(await api.rollbackRun(selected.id, run.id));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }, [selected, run, fail, t]);

  // Recomputing operations means the blueprint moved under a finished review.
  useMemo(() => {
    invalidate();
  }, [operations, invalidate]);

  return {
    supported: isDesktop(),
    targets,
    profileId: selected?.id ?? null,
    setProfileId,
    gates,
    blockers: gateBlockers(gates, t.apply.blocker),
    report,
    run,
    busy,
    error,
    clearError: () => setError(null),
    operationCount: operations.length,
    writableCount: report ? writableDiffs(report).length : 0,
    takeBackup,
    review,
    confirm,
    unconfirm,
    apply: applyNow,
    rollback,
  };
}
