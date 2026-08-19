import { useCallback, useMemo, useRef, useState } from 'react';
import * as api from '@/survey/client';
import type { Clearance, CommandOutput, Profile } from '@/survey/model';

/**
 * Running a plan step's commands over SSH.
 *
 * The plan has always prepared exact command text; until now the only thing to
 * do with it was copy it. This runs it on a saved profile instead — with the
 * same rules the SSH console works under, and for the same reason: the two
 * must not be able to drift apart.
 *
 *   - The clearance comes from the native policy, never from here. What the
 *     badge says and what the far side will accept are one answer.
 *   - A mutating command runs only if the user approved that exact text, and
 *     one approval authorises one run.
 *   - A forbidden command is not offered at all. The plan already marks the
 *     destructive ones; the policy refuses them regardless of what is asked.
 *
 * Output is kept per action rather than as a session log: while working through
 * a step, what matters is what this command just did, next to the command.
 */

export interface PlanRun extends CommandOutput {
  /** Set when the run never reached the far end. */
  error?: string;
}

export interface PlanRunnerApi {
  /** Live running is possible at all in this build. */
  supported: boolean;
  /** Profiles that can carry a command: ssh on, host key pinned. */
  profiles: Profile[];
  selected: Profile | undefined;
  select: (id: string) => void;
  /** A command may actually be sent somewhere. */
  ready: boolean;

  /** Asks the native policy about a command. Cached; safe to call on render. */
  classify: (command: string) => void;
  clearanceOf: (command: string) => Clearance | null;

  /** The user has read this exact command and wants it run. */
  approved: (key: string, command: string) => boolean;
  approve: (key: string, command: string, approved: boolean) => void;

  running: (key: string) => boolean;
  runOf: (key: string) => PlanRun | null;
  run: (key: string, command: string) => Promise<void>;
}

export function usePlanRunner(profiles: Profile[]): PlanRunnerApi {
  const supported = api.surveySupported();

  // A profile without an accepted host key is not a route: the native side
  // refuses to open the session, so offering it would only produce a failure.
  const sshProfiles = useMemo(
    () => profiles.filter((p) => p.sshEnabled && p.sshFingerprint),
    [profiles],
  );

  const [selectedId, setSelectedId] = useState('');
  const [clearances, setClearances] = useState<Record<string, Clearance>>({});
  const [approvals, setApprovals] = useState<Record<string, string>>({});
  const [runs, setRuns] = useState<Record<string, PlanRun>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const selected = sshProfiles.find((p) => p.id === selectedId) ?? sshProfiles[0];

  // Verdicts are cached by command text, so the same command in two steps is
  // asked about once and answered the same way in both.
  const asked = useRef(new Set<string>());
  const classify = useCallback(
    (command: string) => {
      if (!supported || !command.trim() || asked.current.has(command)) return;
      asked.current.add(command);
      api
        .classifySshCommand(command)
        .then((verdict) => setClearances((prev) => ({ ...prev, [command]: verdict })))
        // Left out of the cache so a later render can ask again.
        .catch(() => asked.current.delete(command));
    },
    [supported],
  );

  const approve = useCallback((key: string, command: string, yes: boolean) => {
    setApprovals((prev) => {
      const next = { ...prev };
      if (yes) next[key] = command;
      else delete next[key];
      return next;
    });
  }, []);

  const run = useCallback(
    async (key: string, command: string) => {
      if (!selected || !command.trim()) return;
      setBusy((prev) => ({ ...prev, [key]: true }));
      const confirmed = approvals[key] === command;
      try {
        const output = await api.runSshCommand(selected.id, command, confirmed);
        setRuns((prev) => ({ ...prev, [key]: output }));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setRuns((prev) => ({
          ...prev,
          [key]: {
            command,
            executed: command,
            clearance: clearances[command] ?? 'mutating',
            stdout: '',
            stderr: '',
            exitStatus: null,
            truncated: false,
            durationMs: 0,
            ranAt: new Date().toISOString(),
            error: message,
          },
        }));
      } finally {
        setBusy((prev) => ({ ...prev, [key]: false }));
        // One approval authorises one run.
        setApprovals((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    },
    [selected, approvals, clearances],
  );

  return {
    supported,
    profiles: sshProfiles,
    selected,
    select: setSelectedId,
    ready: supported && selected !== undefined,
    classify,
    clearanceOf: (command) => clearances[command] ?? null,
    approved: (key, command) => approvals[key] === command,
    approve,
    running: (key) => busy[key] === true,
    runOf: (key) => runs[key] ?? null,
    run,
  };
}
