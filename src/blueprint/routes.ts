import { flavourOf, type Profile, type SshFlavour } from '@/survey/model';
import type { TargetPlatform } from './model';

/*
 * Which machine a plan's command goes to.
 *
 * The runner used to have one selected SSH profile and send every command to
 * it, whatever the step was about. With a UniFi gateway and a Proxmox host both
 * reachable over SSH — which is what the guided connection offers for both —
 * the first of the two was the default for everything, and a `pct create` was
 * one approval away from being sent to the gateway. The native policy would
 * have classified it and the gateway would have refused to know the command;
 * neither is a reason to send it.
 *
 * A step already says what it is about: every action carries its target. So
 * the route is decided by that, per kind of machine, and a command can only
 * ever be offered on a machine of the kind it was written for.
 */

/** The kind of machine a target's commands are run on. */
export function flavourFor(target: TargetPlatform): SshFlavour {
  switch (target) {
    // Docker lives inside the host's guests and is reached from the host —
    // `pct exec` for a container, the guest agent for a virtual machine — and
    // the host's own paperwork steps carry no commands of their own.
    case 'proxmox':
    case 'docker':
    case 'host':
      return 'proxmox';
    case 'unifi':
      return 'unifi';
    default:
      return 'other';
  }
}

/**
 * The profiles that can carry a target's commands: SSH on, host key accepted,
 * and the right kind of machine. A profile without an accepted key is not a
 * route — the native side refuses to open the session.
 */
export function routesFor(profiles: Profile[], target: TargetPlatform): Profile[] {
  const want = flavourFor(target);
  return profiles.filter((p) => p.sshEnabled && p.sshFingerprint && flavourOf(p) === want);
}
