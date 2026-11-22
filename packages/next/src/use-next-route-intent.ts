"use client";

import type { ScheduledPrediction } from "@inttegro/cogni-client";
import { useCogniScheduler } from "@inttegro/cogni-react";
import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  createNextRouteCandidate,
  prefetchWithNextRouter,
  type NextRouteCandidateOptions,
  type NextRoutePrefetch,
} from "./route";

export type NextRouteIntentTrigger = "hover" | "focus" | "pointer" | "touch" | "click";

export interface UseNextRouteIntentOptions extends NextRouteCandidateOptions {
  readonly href: string;
  readonly enabled?: boolean;
  readonly hoverDelayMs?: number;
  readonly maxDeferMs?: number;
  readonly prefetchRoute?: NextRoutePrefetch;
  readonly onInvalidate?: () => void;
}

export interface NextRouteIntentActions {
  scheduleHover(): void;
  runNow(trigger: Exclude<NextRouteIntentTrigger, "hover">): void;
  commit(): void;
  cancel(): void;
}

/**
 * Converts route-level pointer, focus, touch, and click signals into one
 * deduplicated Cogni prediction and records reuse on committed navigation.
 */
export function useNextRouteIntent({
  href,
  enabled = true,
  hoverDelayMs = 120,
  maxDeferMs,
  prefetchRoute,
  onInvalidate,
  ...candidateOptions
}: UseNextRouteIntentOptions): NextRouteIntentActions {
  const router = useRouter();
  const scheduler = useCogniScheduler();
  const scheduledRef = useRef<ScheduledPrediction | null>(null);
  const prefetchRouteRef = useRef(prefetchRoute);
  const onInvalidateRef = useRef(onInvalidate);
  prefetchRouteRef.current = prefetchRoute;
  onInvalidateRef.current = onInvalidate;

  const cancel = useCallback(() => {
    const scheduled = scheduledRef.current;
    scheduledRef.current = null;
    scheduled?.cancel();
  }, []);

  const start = useCallback(
    (trigger: NextRouteIntentTrigger, immediate: boolean) => {
      if (!enabled) return null;

      const current = scheduledRef.current;
      if (current?.status === "started") return current;
      if (current?.status === "pending" && !immediate) return current;
      if (current) cancel();

      const candidate = createNextRouteCandidate(href, trigger, candidateOptions);
      const scheduled = scheduler.schedule(
        candidate,
        async ({ signal }) => {
          if (signal.aborted) return { materialWork: false };

          const invalidate = () => {
            cancel();
            onInvalidateRef.current?.();
          };
          const customPrefetch = prefetchRouteRef.current;
          if (customPrefetch) {
            return customPrefetch(href, { signal, onInvalidate: invalidate });
          }

          prefetchWithNextRouter(router, href, invalidate);
        },
        {
          delayMs: immediate ? 0 : hoverDelayMs,
          idle: false,
          allowDuringForeground: immediate,
          ...(maxDeferMs === undefined ? {} : { maxDeferMs }),
        },
      );
      scheduledRef.current = scheduled;
      if (immediate) scheduled.startNow();

      void scheduled.started.then((handle) => {
        if (!handle) {
          if (scheduledRef.current === scheduled) scheduledRef.current = null;
          return;
        }

        void handle.completion.then(() => {
          if (scheduledRef.current === scheduled) scheduledRef.current = null;
        });
      });
      return scheduled;
    },
    [
      cancel,
      candidateOptions.cost,
      candidateOptions.destination,
      candidateOptions.estimatedBytes,
      candidateOptions.horizonMs,
      candidateOptions.key,
      candidateOptions.policy,
      candidateOptions.priority,
      candidateOptions.probability,
      enabled,
      hoverDelayMs,
      href,
      maxDeferMs,
      router,
      scheduler,
    ],
  );

  const scheduleHover = useCallback(() => {
    start("hover", false);
  }, [start]);

  const runNow = useCallback(
    (trigger: Exclude<NextRouteIntentTrigger, "hover">) => {
      start(trigger, true);
    },
    [start],
  );

  const commit = useCallback(() => {
    const scheduled = start("click", true);
    if (!scheduled) return;

    void scheduled.started.then((handle) => {
      handle?.markReused();
    });
  }, [start]);

  useEffect(
    () => cancel,
    [
      cancel,
      candidateOptions.cost,
      candidateOptions.destination,
      candidateOptions.estimatedBytes,
      candidateOptions.horizonMs,
      candidateOptions.key,
      candidateOptions.policy,
      candidateOptions.priority,
      candidateOptions.probability,
      enabled,
      hoverDelayMs,
      href,
      maxDeferMs,
      router,
      scheduler,
    ],
  );

  return { scheduleHover, runNow, commit, cancel };
}
