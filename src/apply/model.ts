import type { NetworkRole } from '@/blueprint/model';
import type { Dict } from '@/i18n';

/*
 * Apply layer.
 *
 * This is the only part of the application that changes anything, so it is
 * deliberately the narrowest. Three rules shape it:
 *
 * 1. Operations are compiled from the *typed* target state, never from the
 *    human-readable strings in the plan. Nothing here parses prose.
 * 2. Every operation carries a natural key, so applying twice is a no-op
 *    rather than a duplicate.
 * 3. Nothing is written until a backup exists, a dry run has been produced
 *    from the current live state, and the user has confirmed that exact run.
 *
 * Firewall rules are intentionally absent from the writable set. A wrong VLAN
 * is deleted in a second; a wrong rule order can lock you out of the gateway
 * that would let you fix it. They stay prepared-only until rollback is proven
 * on the simpler objects.
 */

/**
 * Object types the applier may write. Anything not listed cannot be written —
 * the Rust side allowlists endpoints against this same set.
 *
 * SSIDs are not here yet. Their per-key VLAN mapping depends on network ids
 * that only exist after the networks are applied, and getting it wrong drops
 * every wireless client at once. They land once rollback is proven on
 * networks.
 */
export type OperationKind = 'unifi.network' | 'unifi.portconf';

/** The sentences that explain why an apply is held back. */
export type BlockerText = Dict['apply']['blocker'];

export interface ApplyOperation {
  id: string;
  kind: OperationKind;
  /** Human label for the diff and the journal. */
  label: string;
  /** Blueprint module that asked for this. */
  moduleId: string;
  /**
   * What the object is for in the target state, where that has a bearing on
   * whether the application may write it at all. A VPN range is the case that
   * needs it: the gateway's own VPN server owns that network, so finding one
   * already there is the expected outcome rather than a clash.
   */
  role?: NetworkRole;
  /**
   * How to find the object that already represents this one. Matching is by a
   * stable natural key, never by array position.
   */
  matchField: string;
  matchValue: string | number;
  /** Field values the blueprint asks for. */
  desired: Record<string, unknown>;
  /**
   * Sensible starting values written only when the object is created. On an
   * existing object these are left alone, so a DHCP range someone tuned by
   * hand is not reset by an apply.
   */
  createOnly: Record<string, unknown>;
  /**
   * Fields the applier owns. Anything outside this list is left exactly as the
   * controller has it, so hand-made settings survive an apply.
   */
  managedFields: string[];
}

export type DiffVerdict = 'create' | 'update' | 'noop' | 'conflict' | 'external';

export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface OperationDiff {
  operation: ApplyOperation;
  verdict: DiffVerdict;
  /** Controller-side id of the matched object, when one exists. */
  existingId?: string;
  changes: FieldChange[];
  /** Why the operation is blocked, when the verdict is `conflict`. */
  blockedReason?: string;
  /** Why nothing is written, when something outside the application provides it. */
  note?: string;
}

export interface DryRunReport {
  /** Ties an apply request to the exact dry run it was reviewed from. */
  token: string;
  createdAt: string;
  /** Snapshot the dry run was computed against. */
  snapshotId: string;
  diffs: OperationDiff[];
  counts: Record<DiffVerdict, number>;
  /** Reasons the run cannot proceed at all. */
  blockers: string[];
}

/* ------------------------------------------------------------------- gates */

export interface ApplyGates {
  /** A site backup was taken and written to disk in this session. */
  backup: { ready: boolean; path?: string; takenAt?: string };
  /** A dry run exists for the current target state and live snapshot. */
  dryRun: { ready: boolean; token?: string; createdAt?: string };
  /** The user confirmed this specific dry run. */
  confirmed: { ready: boolean; token?: string };
}

export function gateBlockers(gates: ApplyGates, x: BlockerText): string[] {
  const out: string[] = [];
  if (!gates.backup.ready) out.push(x.noBackup);
  if (!gates.dryRun.ready) out.push(x.noDryRun);
  if (!gates.confirmed.ready) out.push(x.notConfirmed);
  if (
    gates.dryRun.ready &&
    gates.confirmed.ready &&
    gates.dryRun.token !== gates.confirmed.token
  ) {
    out.push(x.staleConfirmation);
  }
  return out;
}

/* ----------------------------------------------------------------- journal */

export type OperationOutcome = 'applied' | 'skipped' | 'failed' | 'rolled-back';

export interface JournalEntry {
  operationId: string;
  kind: OperationKind;
  label: string;
  verdict: DiffVerdict;
  outcome: OperationOutcome;
  /** Controller id of the object after the write. */
  objectId?: string;
  /**
   * The object as it was before the write, so it can be put back. Absent for
   * creates — those roll back by deletion.
   */
  previous?: Record<string, unknown>;
  /** Whether this run created the object, which decides how it rolls back. */
  created: boolean;
  error?: string;
  at: string;
}

export interface ApplyRun {
  id: string;
  startedAt: string;
  finishedAt?: string;
  profileId: string;
  dryRunToken: string;
  backupPath?: string;
  entries: JournalEntry[];
  /** Set when the run stopped early. */
  abortedReason?: string;
}

export function runCounts(run: ApplyRun): Record<OperationOutcome, number> {
  const counts: Record<OperationOutcome, number> = {
    applied: 0,
    skipped: 0,
    failed: 0,
    'rolled-back': 0,
  };
  for (const e of run.entries) counts[e.outcome] += 1;
  return counts;
}

/** Entries that can still be undone, newest first — rollback runs in reverse. */
export function rollbackable(run: ApplyRun): JournalEntry[] {
  return run.entries.filter((e) => e.outcome === 'applied').reverse();
}
