"use client";

import type {
  PredictionCandidate,
  PredictionLoader,
  PredictionScheduleOptions,
  ScheduledPrediction,
} from "@inttegro/cogni-client";
import { useEffect, useRef, useState } from "react";
import { useCogniScheduler } from "./provider";

/**
 * Schedules one prediction for the lifetime of the supplied candidate and
 * cancels it when the component unmounts or the candidate changes.
 */
export function useScheduledPrediction(
  candidate: PredictionCandidate | null,
  loader: PredictionLoader,
  options: PredictionScheduleOptions = {},
): ScheduledPrediction | null {
  const scheduler = useCogniScheduler();
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const [scheduled, setScheduled] = useState<ScheduledPrediction | null>(null);

  useEffect(() => {
    if (!candidate) {
      setScheduled(null);
      return;
    }

    const next = scheduler.schedule(
      candidate,
      (execution) => loaderRef.current(execution),
      options,
    );
    setScheduled(next);

    return () => {
      next.cancel();
    };
  }, [
    scheduler,
    candidate?.key,
    candidate?.policy,
    candidate?.trigger,
    candidate?.destination,
    candidate?.probability,
    candidate?.horizonMs,
    candidate?.cost,
    candidate?.priority,
    candidate?.estimatedBytes,
    options.delayMs,
    options.idle,
    options.idleTimeoutMs,
    options.maxDeferMs,
    options.allowDuringForeground,
  ]);

  return scheduled;
}
