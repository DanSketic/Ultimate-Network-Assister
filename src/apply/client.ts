import { isDesktop } from '@/lib/desktop';
import type { ApplyOperation, ApplyRun, OperationDiff } from './model';

/*
 * Wrappers over the write commands.
 *
 * Note what is *not* here: no endpoint, no HTTP method, no URL. The frontend
 * names an object kind and hands over field values; the native side decides
 * where that goes. There is no way to ask this layer to call an arbitrary
 * address.
 */

// Backstops, not user-facing copy: the views gate on `supported` and show a
// translated explanation long before either of these can be reached.
async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isDesktop()) {
    throw new Error('writing to a live system requires the desktop build');
  }
  const { invoke: call } = await import('@tauri-apps/api/core');
  return call<T>(command, args);
}

export interface BackupResult {
  path: string;
  bytes: number;
  takenAt: string;
}

export function takeSiteBackup(profileId: string): Promise<BackupResult> {
  return invoke<BackupResult>('take_site_backup', { profileId });
}

/** Shape the native side accepts. Mirrors `apply::WriteOp`. */
interface WriteOp {
  id: string;
  kind: ApplyOperation['kind'];
  label: string;
  verdict: 'create' | 'update';
  existingId: string | null;
  desired: Record<string, unknown>;
  createOnly: Record<string, unknown>;
  managedFields: string[];
}

function toWriteOp(diff: OperationDiff): WriteOp {
  if (diff.verdict !== 'create' && diff.verdict !== 'update') {
    throw new Error(`a non-writable operation reached apply: ${diff.operation.label}`);
  }
  return {
    id: diff.operation.id,
    kind: diff.operation.kind,
    label: diff.operation.label,
    verdict: diff.verdict,
    existingId: diff.existingId ?? null,
    desired: diff.operation.desired,
    createOnly: diff.operation.createOnly,
    managedFields: diff.operation.managedFields,
  };
}

export function applyOperations(input: {
  profileId: string;
  dryRunToken: string;
  confirmToken: string;
  backupPath: string;
  diffs: OperationDiff[];
}): Promise<ApplyRun> {
  return invoke<ApplyRun>('apply_operations', {
    profileId: input.profileId,
    dryRunToken: input.dryRunToken,
    confirmToken: input.confirmToken,
    backupPath: input.backupPath,
    operations: input.diffs.map(toWriteOp),
  });
}

export function rollbackRun(profileId: string, runId: string): Promise<ApplyRun> {
  return invoke<ApplyRun>('rollback_apply_run', { profileId, runId });
}

export function listApplyRuns(): Promise<ApplyRun[]> {
  return invoke<ApplyRun[]>('list_apply_runs');
}
