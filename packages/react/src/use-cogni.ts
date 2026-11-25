"use client";

import {
  createPredictionCandidate,
  type PredictionCandidateInput,
  type PredictionLoader,
  type PredictionScheduleOptions,
  type ScheduledPrediction,
} from "@inttegro/cogni-client";
import { useCallback, useMemo } from "react";
import { useScheduledPrediction } from "./use-scheduled-prediction";

export interface UseCogniPredictionOptions extends PredictionCandidateInput {
  /** Work that populates the same representation consumed by the foreground app. */
  readonly load: PredictionLoader;
  readonly enabled?: boolean;
  /** Advanced scheduler overrides. Ordinary background work should use the defaults. */
  readonly schedule?: PredictionScheduleOptions;
}

export interface LocalCogniPredictionActions {
  readonly scheduled: ScheduledPrediction | null;
  /** Call when foreground behavior consumes the representation populated by `load`. */
  markReused(): Promise<boolean>;
  cancel(): void;
}

/**
 * Adopts Cogni's default policy for one piece of host-approved reusable work.
 *
 * The host supplies identity and a cache-aware loader. Cogni supplies the
 * initial prior, reuse horizon, idle scheduling, browser safety gates, shared
 * budgets, and—when the default provider is used—adaptive calibration.
 */
export function useCogniPrediction({
  load,
  enabled = true,
  schedule,
  ...input
}: UseCogniPredictionOptions): LocalCogniPredictionActions {
  const scheduled = useScheduledPrediction(
    enabled ? createPredictionCandidate(input) : null,
    load,
    schedule,
  );
  const markReused = useCallback(async () => {
    if (!scheduled) return false;
    scheduled.startNow();
    const handle = await scheduled.started;
    return handle?.markReused() ?? false;
  }, [scheduled]);
  const cancel = useCallback(() => scheduled?.cancel(), [scheduled]);

  return useMemo(
    () => ({ scheduled, markReused, cancel }),
    [cancel, markReused, scheduled],
  );
}
