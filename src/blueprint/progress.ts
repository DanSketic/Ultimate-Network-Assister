import type { PlanStep } from './model';

/*
 * Which plan steps are behind us, kept across restarts — and said how.
 *
 * This used to be held for the session only, on the grounds that a tick saved
 * to a file is a claim about a machine nobody has looked at since. That is
 * still true, and it is why a saved tick is never just "done": it carries how
 * it came about — run here, ticked by hand, written by the applier, or found
 * already in place by a dry run — and when, and the interface says both. A
 * plan worked through over several evenings otherwise loses its place every
 * time the window closes, and that costs most the person who least knows
 * which of forty steps they had reached.
 *
 * A tick is also bound to the step as it stood when it was made. If the plan
 * has since changed what the step does — a VLAN renumbered, a machine resized
 * — the tick is about a different step, and it stops counting.
 *
 * Kept beside the session bookmark rather than inside the blueprint: a
 * blueprint is a document that can be exported and handed to somebody else,
 * and "I did step 12 on Tuesday" is not part of it.
 */

/** How a step came to be done. */
export type MarkHow = 'ran' | 'manual' | 'applied' | 'verified';

export interface StepMark {
  /** ISO time the tick was made. */
  at: string;
  how: MarkHow;
  /** The step's fingerprint at that time; see `stepPrint`. */
  print: string;
}

/** Ticks for one blueprint, by step id. */
export type Progress = Record<string, StepMark>;

const KEY = 'una.progress.v1';
const HOWS: readonly MarkHow[] = ['ran', 'manual', 'applied', 'verified'];

/**
 * A short fingerprint of what a step asks for.
 *
 * Built from what does not move with the interface language: the commands,
 * which are the same text in both, and the digits in everything else —
 * addresses, VLAN ids, sizes, ports. Hashing the title would have put every
 * tick in the estate out of date the moment someone switched language, which
 * is a change to the words and not to the work. Digits alone, without the
 * separators between them, because the languages write one number two ways:
 * "2,4 GHz" and "2.4 GHz" are the same band.
 */
export function stepPrint(step: PlanStep): string {
  const parts = [step.id];
  for (const a of step.actions) {
    parts.push(a.kind === 'command' ? a.body : (a.body.match(/\d+/g) ?? []).join(' '));
  }
  const text = parts.join('\n');
  // djb2: short, stable, and more than enough to tell two versions of one
  // step apart. Nothing here is a security boundary.
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * Every blueprint's ticks, validated on the way in.
 *
 * The same care as the session bookmark: this is a user-editable file read by
 * builds newer than the one that wrote it, and one unexpected value must cost
 * that value and nothing else.
 */
function readAll(): Record<string, Progress> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};

    const out: Record<string, Progress> = {};
    for (const [bpId, marks] of Object.entries(parsed as Record<string, unknown>)) {
      if (bpId.length > 200 || typeof marks !== 'object' || marks === null) continue;
      const kept: Progress = {};
      for (const [stepId, mark] of Object.entries(marks as Record<string, unknown>)) {
        const m = mark as Partial<StepMark> | null;
        if (
          stepId.length <= 200 &&
          m !== null &&
          typeof m === 'object' &&
          typeof m.at === 'string' &&
          Number.isFinite(Date.parse(m.at)) &&
          HOWS.includes(m.how as MarkHow) &&
          typeof m.print === 'string' &&
          m.print.length <= 40
        ) {
          kept[stepId] = { at: m.at, how: m.how as MarkHow, print: m.print };
        }
      }
      out[bpId] = kept;
    }
    return out;
  } catch {
    return {};
  }
}

export function loadProgress(blueprintId: string): Progress {
  return readAll()[blueprintId] ?? {};
}

export function saveProgress(blueprintId: string, progress: Progress): void {
  try {
    const all = readAll();
    if (Object.keys(progress).length === 0) delete all[blueprintId];
    else all[blueprintId] = progress;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage unavailable or full: the ticks hold for this session and are
    // gone at the next, which is how it always used to be.
  }
}
