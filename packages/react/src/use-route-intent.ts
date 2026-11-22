"use client";

import type { ScheduledPrediction } from "@inttegro/cogni-client";
import { useCallback, useEffect, useRef } from "react";
import { useCogniScheduler } from "./provider";
import {
  createRouteCandidate,
  type RouteCandidateOptions,
  type RouteIntentTrigger,
  type RoutePrefetch,
} from "./route";

export interface UseRouteIntentOptions extends RouteCandidateOptions {
  readonly href: string;
  readonly prefetchRoute: RoutePrefetch;
  readonly enabled?: boolean;
  readonly hoverDelayMs?: number;
  readonly maxDeferMs?: number;
  /** Keep active work alive when a router link unmounts during navigation. */
  readonly retainOnUnmount?: boolean;
}

export interface RouteIntentActions {
  scheduleHover(): void;
  runNow(trigger: Exclude<RouteIntentTrigger, "hover">): void;
  /** Mark the prediction reused only after the router accepts the destination. */
  commit(): void;
  cancel(): void;
}

/**
 * Shared route-intent lifecycle for router adapters.
 *
 * Router packages supply the cache operation and call commit only after their
 * own navigation lifecycle confirms that the destination was accepted.
 */
export function useRouteIntent({
  href,
  prefetchRoute,
  enabled = true,
  hoverDelayMs = 120,
  maxDeferMs,
  retainOnUnmount = false,
  ...candidateOptions
}: UseRouteIntentOptions): RouteIntentActions {
  const scheduler = useCogniScheduler();
  const scheduledRef = useRef<ScheduledPrediction | null>(null);
  const retainOnUnmountRef = useRef(retainOnUnmount);
  const prefetchRouteRef = useRef(prefetchRoute);
  retainOnUnmountRef.current = retainOnUnmount;
  prefetchRouteRef.current = prefetchRoute;

  const cancel = useCallback(() => {
    const scheduled = scheduledRef.current;
    scheduledRef.current = null;
    scheduled?.cancel();
  }, []);

  const start = useCallback(
    (trigger: RouteIntentTrigger, immediate: boolean) => {
      if (!enabled) return null;

      const current = scheduledRef.current;
      if (current?.status === "started") return current;
      if (current?.status === "pending" && !immediate) return current;
      if (current) cancel();

      const scheduled = scheduler.schedule(
        createRouteCandidate(href, trigger, candidateOptions),
        async ({ signal }) => prefetchRouteRef.current(href, { signal }),
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
      scheduler,
    ],
  );

  const scheduleHover = useCallback(() => {
    start("hover", false);
  }, [start]);

  const runNow = useCallback(
    (trigger: Exclude<RouteIntentTrigger, "hover">) => {
      start(trigger, true);
    },
    [start],
  );

  const commit = useCallback(() => {
    const scheduled = start("click", true);
    if (!scheduled) return;
    if (scheduledRef.current === scheduled) scheduledRef.current = null;

    void scheduled.started.then((handle) => {
      handle?.markReused();
    });
  }, [start]);

  const identityInitializedRef = useRef(false);
  useEffect(() => {
    if (identityInitializedRef.current) cancel();
    else identityInitializedRef.current = true;
  }, [
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
    scheduler,
  ]);

  useEffect(
    () => () => {
      if (!retainOnUnmountRef.current) cancel();
    },
    [cancel],
  );

  return { scheduleHover, runNow, commit, cancel };
}
