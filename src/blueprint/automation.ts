import type { Dict } from '@/i18n';
import type { AutomationLevel, PlanAction } from './model';

/**
 * Safety policy: how far the application may go on a step.
 *
 * The rule the estate is built on is that configuration is reversible and
 * storage is not. A wrong firewall rule is an outage you fix in a minute; a
 * wrong device path in `zpool create` is gone. So destructive storage work is
 * capped at `manual` here, structurally — not by a setting a user can flip.
 */

/** Commands that can destroy a filesystem or a partition table outright. */
const DESTRUCTIVE_COMMANDS = [
  'wipefs',
  'sgdisk',
  'mkfs',
  'zpool create',
  'zpool destroy',
  'parted',
  'dd ',
  'blkdiscard',
];

export function isDestructiveCommand(body: string): boolean {
  const normalised = body.toLowerCase();
  return DESTRUCTIVE_COMMANDS.some((c) => normalised.includes(c));
}

/**
 * Commands that can take a service — or the session running them — off the air.
 *
 * A different question from `destructive`, and one that used to have no answer
 * here at all: nothing on this list loses data, and every one of them can
 * interrupt something while it happens. Reloading the bridge configuration on
 * the host you are connected to is the plain case — it is exactly what setting
 * up a trunk requires, and it can also drop the SSH session doing it.
 *
 * So this does not refuse anything. It is what the plan uses to say "this one
 * can cut you off" before you approve it, which is the difference between a
 * surprise and a decision.
 */
const DISRUPTIVE_COMMANDS = [
  'ifreload',
  'ifdown',
  'ifup',
  'systemctl restart',
  'systemctl stop',
  'service ',
  'pve-firewall restart',
  'pveproxy restart',
  'nft -f',
  'iptables-restore',
  'qm stop',
  'pct stop',
  'qm shutdown',
  'pct shutdown',
  'apt full-upgrade',
  'apt dist-upgrade',
  'apt upgrade',
  'proxmox-boot-tool refresh',
  'update-initramfs',
];

export function isDisruptiveCommand(body: string): boolean {
  const normalised = body.toLowerCase();
  return DISRUPTIVE_COMMANDS.some((c) => normalised.includes(c));
}

/**
 * True when the body is something to read rather than something to run.
 *
 * Not every `command` action is a command. Some are a fragment of a file to
 * paste (`iface vmbr1 inet manual`), some are a shape with a blank left in it
 * (`qm clone <template> …`, `K3S_TOKEN=<token>`), and some are only a comment
 * naming what the step is about. Sending any of those verbatim would fail at
 * best; the placeholder is there precisely because the application does not
 * know the value, and guessing is not one of its jobs.
 */
export function isTemplateCommand(body: string): boolean {
  // `<name>` and `…` are how the plan writes "fill this in yourself".
  if (/<[^<>\n]+>/.test(body) || body.includes('…') || body.includes('...')) return true;

  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return true;
  // Nothing but comments: prose wearing a command's clothes.
  if (lines.every((l) => l.startsWith('#'))) return true;
  // A stanza of an interfaces file: indented continuation lines under a
  // keyword, with nothing that could be a command on its own.
  if (lines.length > 1 && /^(auto|iface|allow-)/.test(lines[0] ?? '')) return true;

  return false;
}

export interface Capability {
  level: AutomationLevel;
  /** Present when the policy capped the step below what it asked for. */
  reason?: string;
}

/** The explanations for a cap. Passed in so the policy stays language-free. */
type CapabilityText = Dict['blueprint']['capability'];

/**
 * How far this application *could* take a step, which is not the same as how
 * far the plan recommends taking it.
 *
 * This used to answer the second question, and the two had been one field for
 * as long as there was only one thing to do with a command: copy it. Now that
 * the plan can run what it prepares, a step that asks for `assisted` — a
 * package install, a container created — is still something the application is
 * able to do end to end, and refusing to let anyone say so made the setting
 * useless exactly where it mattered. The ceiling is what is possible; the
 * plan's own `requested` stays as the recommendation, and the run mode picks
 * anywhere at or below the ceiling.
 *
 * What the ceiling is not is a loosening of the rule the estate is built on.
 * Destructive storage work is still capped at `manual` here, structurally, and
 * the native SSH policy refuses those commands again on the other side of the
 * IPC boundary whatever this says.
 */
export function capabilityFor(
  requested: AutomationLevel,
  actions: PlanAction[],
  why: CapabilityText,
): Capability {
  if (actions.some((a) => a.destructive || isDestructiveCommand(a.body))) {
    return { level: 'manual', reason: why.destructiveStorage };
  }

  // Nothing to run: a step that is a decision, a physical job or a page to
  // read. There is no automating a conversation with a screwdriver.
  if (actions.length === 0) return { level: 'manual' };

  /*
   * A command with a blank left in it is not a command.
   *
   * `qm clone <template>` is a shape for a person to fill; sending it verbatim
   * fails, and pretending the step is automatable would promise a run that
   * cannot happen. A step whose commands are all templates stays where the
   * plan put it.
   */
  const commands = actions.filter((a) => a.kind === 'command');
  const runnable = commands.filter((a) => !isTemplateCommand(a.body));
  if (commands.length > 0 && runnable.length === 0) {
    return { level: requested === 'auto' ? 'assisted' : requested, reason: why.templateOnly };
  }

  if (requested === 'manual' && commands.length === 0) return { level: 'manual' };

  // A step that can only be done by clicking through a vendor UI cannot be
  // automated, however safe it is.
  const hasApi = actions.some((a) => a.kind === 'api');
  const writable = actions.some((a) => a.kind === 'api' && a.writable);
  const onlyUi = actions.length > 0 && actions.every((a) => a.kind === 'ui');

  if (onlyUi) {
    return {
      level: 'assisted',
      reason: requested === 'auto' ? why.noApi : undefined,
    };
  }

  /*
   * Automatable means this application can do it, not that an API exists.
   *
   * Describing a call is not making one. The applier writes two kinds of
   * object; a step whose API actions are anything else is a description for a
   * person to carry out, and counting it as automatable would be a promise
   * nothing in the code could keep.
   *
   * A command is the other way round: the application has an SSH session, the
   * native policy decides what may go down it, and running one is something it
   * genuinely does. So a step with runnable commands reaches `auto` — capped,
   * as everything is, by what the policy accepts when the moment comes.
   */
  if (runnable.length > 0) return { level: 'auto' };

  if (!writable) {
    return {
      level: 'assisted',
      reason: hasApi ? why.notWritten : why.commandOnly,
    };
  }

  return { level: 'auto' };
}

/**
 * The effective mode for a step, given what the user selected for the run.
 * Selecting "automata" never overrides a step's own cap.
 */
export function effectiveLevel(selected: AutomationLevel, capability: AutomationLevel): AutomationLevel {
  const rank: Record<AutomationLevel, number> = { manual: 0, assisted: 1, auto: 2 };
  return rank[selected] < rank[capability] ? selected : capability;
}
