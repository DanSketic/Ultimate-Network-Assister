import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PlanStep } from '@/blueprint/model';
import {
  loadProgress,
  saveProgress,
  stepPrint,
  type MarkHow,
  type Progress,
  type StepMark,
} from '@/blueprint/progress';

/** When this window opened. A tick older than this was made in another sitting. */
const OPENED_AT = new Date().toISOString();

export interface StepStatus {
  mark: StepMark;
  /** Made before this window opened, so worth saying when. */
  earlier: boolean;
  /** The step has changed since it was ticked, so the tick no longer counts. */
  stale: boolean;
}

export interface ProgressApi {
  /** Steps whose tick still describes the step as it is now. */
  done: Set<string>;
  statusOf: (step: PlanStep) => StepStatus | null;
  mark: (step: PlanStep, how: MarkHow) => void;
  unmark: (step: PlanStep) => void;
}

/**
 * The saved ticks for one blueprint's plan.
 *
 * Shared by the planner and the guided path, so a step ticked in one is done in
 * the other. Each view holds its own copy while it is open and only one of them
 * is ever on screen, so reading the store on mount is enough to stay in step.
 */
export function useProgress(blueprintId: string | undefined, steps: PlanStep[]): ProgressApi {
  const [progress, setProgress] = useState<Progress>(() =>
    blueprintId ? loadProgress(blueprintId) : {},
  );

  useEffect(() => {
    setProgress(blueprintId ? loadProgress(blueprintId) : {});
  }, [blueprintId]);

  const prints = useMemo(() => new Map(steps.map((s) => [s.id, stepPrint(s)])), [steps]);

  const done = useMemo(
    () =>
      new Set(
        steps
          .filter((s) => {
            const m = progress[s.id];
            return m !== undefined && m.print === prints.get(s.id);
          })
          .map((s) => s.id),
      ),
    [steps, progress, prints],
  );

  const update = useCallback(
    (fn: (prev: Progress) => Progress) => {
      if (!blueprintId) return;
      setProgress((prev) => {
        const next = fn(prev);
        // Idempotent, so a second invocation of this updater writes the same.
        saveProgress(blueprintId, next);
        return next;
      });
    },
    [blueprintId],
  );

  const mark = useCallback(
    (step: PlanStep, how: MarkHow) =>
      update((prev) => ({
        ...prev,
        [step.id]: { at: new Date().toISOString(), how, print: stepPrint(step) },
      })),
    [update],
  );

  const unmark = useCallback(
    (step: PlanStep) =>
      update((prev) => {
        const next = { ...prev };
        delete next[step.id];
        return next;
      }),
    [update],
  );

  const statusOf = useCallback(
    (step: PlanStep): StepStatus | null => {
      const m = progress[step.id];
      if (!m) return null;
      return { mark: m, earlier: m.at < OPENED_AT, stale: m.print !== prints.get(step.id) };
    },
    [progress, prints],
  );

  return { done, statusOf, mark, unmark };
}
