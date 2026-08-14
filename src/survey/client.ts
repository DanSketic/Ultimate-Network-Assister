import { isDesktop } from '@/lib/desktop';
import type {
  Clearance,
  CommandOutput,
  EndpointProbe,
  HostKeyProbe,
  Profile,
  SnapshotHeader,
  SurveySnapshot,
} from './model';

/*
 * Thin wrappers over the Rust commands.
 *
 * Secrets travel one way only: `storeSecret` sends the value the user typed
 * straight into the Windows Credential Manager, and nothing ever reads one
 * back into the frontend. `hasSecret` answers whether one exists, never what.
 */

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isDesktop()) {
    throw new Error(
      // Backstop, not user-facing copy: the Survey view gates on `supported`
      // and explains this in the interface language long before it is reached.
      'live surveying requires the desktop build: authentication and certificate pinning run natively',
    );
  }
  const { invoke: call } = await import('@tauri-apps/api/core');
  return call<T>(command, args);
}

/** True when live surveying is available at all in this build. */
export function surveySupported(): boolean {
  return isDesktop();
}

export function listProfiles(): Promise<Profile[]> {
  return invoke<Profile[]>('list_profiles');
}

export function saveProfile(profile: Profile): Promise<Profile> {
  return invoke<Profile>('save_profile', { profile });
}

export function deleteProfile(id: string): Promise<void> {
  return invoke<void>('delete_profile', { id });
}

/** `ssh` picks the slot: false is the API credential, true is the ssh one. */
export function storeSecret(id: string, secret: string, ssh = false): Promise<void> {
  return invoke<void>('store_profile_secret', { id, secret, ssh });
}

export function hasSecret(id: string): Promise<boolean> {
  return invoke<boolean>('profile_has_secret', { id });
}

export function deleteSecret(id: string, ssh = false): Promise<void> {
  return invoke<void>('delete_profile_secret', { id, ssh });
}

/**
 * Reads the endpoint's certificate so the user can compare it with the one the
 * server shows. Accepting it is a separate, explicit step.
 */
export function probeEndpoint(baseUrl: string, pinned: string | null): Promise<EndpointProbe> {
  return invoke<EndpointProbe>('probe_endpoint', { baseUrl, pinned });
}

/**
 * Reads the host key so the user can compare it with the server's own.
 *
 * The handshake is aborted natively once the key is captured, so this cannot
 * turn into a session and no credential is offered.
 */
export function probeSshHost(
  host: string,
  port: number,
  pinned: string | null,
): Promise<HostKeyProbe> {
  return invoke<HostKeyProbe>('probe_ssh_host', { host, port, pinned });
}

/** The native policy's verdict on a command, without running it. */
export function classifySshCommand(command: string): Promise<Clearance> {
  return invoke<Clearance>('classify_ssh_command', { command });
}

/**
 * Runs one command over ssh. `confirmed` is the user having approved this exact
 * command text — it unlocks a mutating command, never a forbidden one.
 */
export function runSshCommand(
  profileId: string,
  command: string,
  confirmed: boolean,
): Promise<CommandOutput> {
  return invoke<CommandOutput>('run_ssh_command', { profileId, command, confirmed });
}

export function runSurvey(profileIds: string[]): Promise<SurveySnapshot> {
  return invoke<SurveySnapshot>('run_survey', { profileIds });
}

export function latestSnapshot(): Promise<SurveySnapshot | null> {
  return invoke<SurveySnapshot | null>('latest_snapshot');
}

/** Enough about each kept survey to choose between them, without loading any. */
export function listSnapshots(): Promise<SnapshotHeader[]> {
  return invoke<SnapshotHeader[]>('list_snapshots');
}

export function snapshotById(id: string): Promise<SurveySnapshot | null> {
  return invoke<SurveySnapshot | null>('snapshot_by_id', { id });
}

/**
 * Takes a survey from a file into the history.
 *
 * Validated natively before anything is stored: an imported file is the one
 * snapshot that did not come from this application's own collectors.
 */
export function importSnapshot(payload: string): Promise<SurveySnapshot> {
  return invoke<SurveySnapshot>('import_snapshot', { payload });
}

export function clearSnapshots(): Promise<void> {
  return invoke<void>('clear_snapshots');
}
