/*
 * Whether a connection profile is actually usable right now.
 *
 * A pinned certificate used to be enough for the green dot, which made the
 * light say "ready" about a machine that was switched off: accepting a
 * fingerprint is a decision made once, not a measurement. Green now needs a
 * connect that succeeded, and the two facts — accepted, answering — are kept
 * apart so neither can stand in for the other.
 */
import type { Profile, Reach } from './model';
import type { Tone } from '@/lib/palette';

/** A socket to try, and which half of the profile it belongs to. */
export interface Socket {
  host: string;
  port: number;
  /** True for the ssh half, false for the https endpoint. */
  ssh: boolean;
}

/** What is known about one socket: nothing, a check under way, or a result. */
export type ReachState = 'checking' | { reach: Reach; at: string };

export type ReachMap = Record<string, ReachState>;

export function reachKey(id: string, ssh: boolean): string {
  return `${id}:${ssh ? 'ssh' : 'api'}`;
}

/** The https endpoint, read off the profile's own base URL. */
export function apiSocket(profile: Profile): Socket | null {
  if (profile.kind === 'ssh' || !profile.baseUrl) return null;
  try {
    const url = new URL(profile.baseUrl);
    const port = url.port ? Number(url.port) : 443;
    if (!url.hostname || !Number.isFinite(port) || port <= 0) return null;
    // A bracketed IPv6 literal would not survive being handed back as a host.
    return { host: url.hostname.replace(/^\[|\]$/g, ''), port, ssh: false };
  } catch {
    return null;
  }
}

export function sshSocket(profile: Profile): Socket | null {
  if (!profile.sshEnabled || !profile.sshHost) return null;
  return { host: profile.sshHost, port: profile.sshPort || 22, ssh: true };
}

/** Every socket worth checking for this profile, in the order shown. */
export function socketsOf(profile: Profile): Socket[] {
  const list: Socket[] = [];
  const api = apiSocket(profile);
  if (api) list.push(api);
  const ssh = sshSocket(profile);
  if (ssh) list.push(ssh);
  return list;
}

/**
 * The socket the profile's own light is about: the one a survey of it would
 * go through. For an ssh-only profile that is ssh; for the others, the API.
 */
export function primarySocket(profile: Profile): Socket | null {
  return profile.kind === 'ssh' ? sshSocket(profile) : apiSocket(profile);
}

/** Whether the fingerprint the primary socket needs has been accepted. */
export function accepted(profile: Profile): boolean {
  return Boolean(profile.kind === 'ssh' ? profile.sshFingerprint : profile.fingerprint);
}

export type Health =
  /** No address to try — the profile is not finished. */
  | 'incomplete'
  /** Reachable or not, nothing has been accepted, so it cannot be used. */
  | 'notAccepted'
  /** Accepted, but nobody has looked whether it answers. */
  | 'unchecked'
  | 'checking'
  /** Accepted, and it did not answer. */
  | 'down'
  | 'up';

export function healthOf(profile: Profile, reach: ReachMap): Health {
  const socket = primarySocket(profile);
  if (!socket) return 'incomplete';
  if (!accepted(profile)) return 'notAccepted';
  const state = reach[reachKey(profile.id, socket.ssh)];
  if (!state) return 'unchecked';
  if (state === 'checking') return 'checking';
  return state.reach.up ? 'up' : 'down';
}

/**
 * The dot's colour. Only `up` is green, and only a measurement produces it —
 * which is the whole point of this module.
 */
export function healthTone(health: Health): Tone {
  switch (health) {
    case 'up':
      return 'ok';
    case 'down':
      return 'bad';
    case 'notAccepted':
    case 'incomplete':
      return 'warn';
    default:
      return 'idle';
  }
}

/** Whether a survey of this profile is worth starting at all. */
export function surveyable(profile: Profile, reach: ReachMap): boolean {
  return profile.kind !== 'ssh' && healthOf(profile, reach) !== 'down' && accepted(profile);
}

/** The profiles that were measured as not answering, out of a chosen set. */
export function downAmong(profiles: Profile[], ids: string[], reach: ReachMap): Profile[] {
  return profiles.filter((p) => ids.includes(p.id) && healthOf(p, reach) === 'down');
}
