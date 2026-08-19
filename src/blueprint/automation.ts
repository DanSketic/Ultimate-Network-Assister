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
 * Caps a step's requested automation against what its actions actually permit.
 * Never raises: a step that asks for `manual` stays manual.
 */
export function capabilityFor(
  requested: AutomationLevel,
  actions: PlanAction[],
  why: CapabilityText,
): Capability {
  if (actions.some((a) => a.destructive || isDestructiveCommand(a.body))) {
    return { level: 'manual', reason: why.destructiveStorage };
  }

  if (requested === 'manual') return { level: 'manual' };

  // A step that can only be done by clicking through a vendor UI cannot be
  // automated, however safe it is.
  const hasApi = actions.some((a) => a.kind === 'api');
  const onlyUi = actions.length > 0 && actions.every((a) => a.kind === 'ui');

  if (onlyUi) {
    return {
      level: 'assisted',
      reason: requested === 'auto' ? why.noApi : undefined,
    };
  }

  if (requested === 'auto' && !hasApi) {
    return {
      level: 'assisted',
      reason: why.commandOnly,
    };
  }

  return { level: requested };
}

/**
 * The effective mode for a step, given what the user selected for the run.
 * Selecting "automata" never overrides a step's own cap.
 */
export function effectiveLevel(selected: AutomationLevel, capability: AutomationLevel): AutomationLevel {
  const rank: Record<AutomationLevel, number> = { manual: 0, assisted: 1, auto: 2 };
  return rank[selected] < rank[capability] ? selected : capability;
}
