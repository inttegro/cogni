"use client";

import type {
  PredictionScheduleOptions,
  ScheduledPrediction,
} from "@inttegro/cogni-client";
import { useScheduledPrediction } from "@inttegro/cogni-react";
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  createNextRouteCandidate,
  prefetchWithNextRouter,
  type NextRouteCandidateOptions,
  type NextRoutePrefetch,
} from "./route";

export interface UseNextRoutePredictionOptions extends NextRouteCandidateOptions {
  readonly href: string;
  readonly trigger: string;
  readonly enabled?: boolean;
  readonly schedule?: PredictionScheduleOptions;
  readonly prefetchRoute?: NextRoutePrefetch;
  readonly onInvalidate?: () => void;
}

/** Schedules a calibrated Next route candidate through the shared Cogni scheduler. */
export function useNextRoutePrediction({
  href,
  trigger,
  enabled = true,
  schedule,
  prefetchRoute,
  onInvalidate,
  ...candidateOptions
}: UseNextRoutePredictionOptions): ScheduledPrediction | null {
  const router = useRouter();
  const candidate = enabled
    ? createNextRouteCandidate(href, trigger, candidateOptions)
    : null;

  const loader = useCallback(
    async ({ signal }: { signal: AbortSignal }) => {
      if (signal.aborted) return { materialWork: false };

      const invalidate = () => onInvalidate?.();
      if (prefetchRoute) {
        return prefetchRoute(href, { signal, onInvalidate: invalidate });
      }

      prefetchWithNextRouter(router, href, invalidate);
    },
    [href, onInvalidate, prefetchRoute, router],
  );

  return useScheduledPrediction(candidate, loader, schedule);
}

/** Escalates a scheduled route and records reuse by the committed navigation. */
export async function markRoutePredictionReused(
  scheduled: ScheduledPrediction | null,
): Promise<boolean> {
  if (!scheduled) return false;
  scheduled.startNow();
  const handle = await scheduled.started;
  return handle?.markReused() ?? false;
}
