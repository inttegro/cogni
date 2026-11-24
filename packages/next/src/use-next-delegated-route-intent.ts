"use client";

import {
  useDelegatedRouteIntent,
  type DelegatedRouteCandidateResolver,
  type DelegatedRouteIntentActions,
  type UseDelegatedRouteIntentOptions,
} from "@inttegro/cogni-react";
import { useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { prefetchWithNextRouter, type NextRoutePrefetch } from "./route";

export interface UseNextDelegatedRouteIntentOptions extends Omit<
  UseDelegatedRouteIntentOptions,
  "prefetchRoute" | "resolveCandidate"
> {
  readonly prefetchRoute?: NextRoutePrefetch;
  readonly onInvalidate?: () => void;
  readonly resolveCandidate?: DelegatedRouteCandidateResolver;
}

/** Discovers rendered App Router links without requiring per-link wrappers. */
export function useNextDelegatedRouteIntent({
  prefetchRoute,
  onInvalidate,
  resolveCandidate,
  policy = "next-route",
  ...options
}: UseNextDelegatedRouteIntentOptions): DelegatedRouteIntentActions {
  const router = useRouter();
  const prefetchRouteRef = useRef(prefetchRoute);
  const onInvalidateRef = useRef(onInvalidate);
  const resolveCandidateRef = useRef(resolveCandidate);
  prefetchRouteRef.current = prefetchRoute;
  onInvalidateRef.current = onInvalidate;
  resolveCandidateRef.current = resolveCandidate;

  const delegatedPrefetch = useCallback<
    UseDelegatedRouteIntentOptions["prefetchRoute"]
  >(
    async (href, { signal }) => {
      if (signal.aborted) return { materialWork: false };

      const invalidate = () => onInvalidateRef.current?.();
      const customPrefetch = prefetchRouteRef.current;
      if (customPrefetch) {
        return customPrefetch(href, { signal, onInvalidate: invalidate });
      }

      prefetchWithNextRouter(router, href, invalidate);
    },
    [router],
  );

  const delegatedCandidate = useCallback<DelegatedRouteCandidateResolver>((context) => {
    const candidate = resolveCandidateRef.current?.(context);
    if (candidate === false || candidate === null) return candidate;
    return { key: `next-route:${context.href}`, ...candidate };
  }, []);

  return useDelegatedRouteIntent({
    ...options,
    policy,
    prefetchRoute: delegatedPrefetch,
    resolveCandidate: delegatedCandidate,
  });
}
