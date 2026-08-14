import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as api from '@/survey/client';
import type { Clearance, CommandOutput, Profile } from '@/survey/model';

/**
 * The SSH console's state.
 *
 * Two things are worth noticing. Clearances are never computed here — they come
 * from the native policy, which is the side that actually decides, so the
 * badge the user sees and the rule that runs cannot drift apart. And a
 * confirmation is bound to one exact command string: editing the field clears
 * it, so an approval can never carry over to a command the user did not read.
 */

export interface SshRun extends CommandOutput {
  id: string;
  profileId: string;
  profileLabel: string;
  /** Set when the run never reached the far end. */
  error?: string;
}

export interface SshApi {
  supported: boolean;
  profiles: Profile[];
  selected: Profile | undefined;
  select: (id: string) => void;

  command: string;
  setCommand: (command: string) => void;
  /** Native verdict for the command in the field; null while it is being fetched. */
  clearance: Clearance | null;
  confirmed: boolean;
  setConfirmed: (confirmed: boolean) => void;

  running: boolean;
  history: SshRun[];
  error: string | null;
  clearError: () => void;
  run: () => Promise<void>;
  clearHistory: () => void;
}

/** How many runs to keep on screen. */
const HISTORY = 25;

export function useSsh(profiles: Profile[]): SshApi {
  const supported = api.surveySupported();
  // Any profile with ssh switched on, whatever else it is: a Proxmox host
  // reached both ways shows up here without a second entry.
  const sshProfiles = useMemo(() => profiles.filter((p) => p.sshEnabled), [profiles]);

  const [selectedId, setSelectedId] = useState('');
  const [command, setCommandRaw] = useState('');
  const [clearance, setClearance] = useState<Clearance | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<SshRun[]>([]);
  const [error, setError] = useState<string | null>(null);

  const selected =
    sshProfiles.find((p) => p.id === selectedId) ??
    sshProfiles.find((p) => p.sshFingerprint) ??
    sshProfiles[0];

  const setCommand = useCallback((next: string) => {
    setCommandRaw(next);
    // An approval belongs to the text that was approved, and this is not it.
    setConfirmed(false);
    setClearance(null);
  }, []);

  // Ask the native policy what it makes of the command. Debounced because it
  // runs on every keystroke, and stamped so a slow answer cannot overwrite a
  // newer one.
  const asked = useRef(0);
  useEffect(() => {
    if (!supported || !command.trim()) {
      setClearance(null);
      return;
    }
    const ticket = ++asked.current;
    const timer = window.setTimeout(() => {
      api
        .classifySshCommand(command)
        .then((verdict) => {
          if (asked.current === ticket) setClearance(verdict);
        })
        .catch(() => {
          if (asked.current === ticket) setClearance(null);
        });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [command, supported]);

  const run = useCallback(async () => {
    if (!selected || !command.trim()) return;
    setRunning(true);
    setError(null);
    const label = selected.label;
    const id = `${selected.id}-${Date.now().toString(36)}`;
    try {
      const output = await api.runSshCommand(selected.id, command, confirmed);
      setHistory((prev) => [{ ...output, id, profileId: selected.id, profileLabel: label }, ...prev].slice(0, HISTORY));
      // One approval authorises one run.
      setConfirmed(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      setHistory((prev) =>
        [
          {
            id,
            profileId: selected.id,
            profileLabel: label,
            command,
            clearance: clearance ?? 'mutating',
            stdout: '',
            stderr: '',
            exitStatus: null,
            truncated: false,
            durationMs: 0,
            ranAt: new Date().toISOString(),
            error: message,
          },
          ...prev,
        ].slice(0, HISTORY),
      );
    } finally {
      setRunning(false);
    }
  }, [selected, command, confirmed, clearance]);

  return {
    supported,
    profiles: sshProfiles,
    selected,
    select: setSelectedId,
    command,
    setCommand,
    clearance,
    confirmed,
    setConfirmed,
    running,
    history,
    error,
    clearError: () => setError(null),
    run,
    clearHistory: () => setHistory([]),
  };
}
