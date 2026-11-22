import type {
  PredictionCandidate,
  PredictionCost,
  PredictionWorkResult,
} from "@inttegro/cogni-client";

export interface NextRoutePrefetchContext {
  readonly signal: AbortSignal;
  readonly onInvalidate: () => void;
}

/**
 * Host-injectable route loading seam. Applications can use the public Next
 * router or inject a version-specific full-route prefetch implementation.
 */
export type NextRoutePrefetch = (
  href: string,
  context: NextRoutePrefetchContext,
) => PredictionWorkResult | void | Promise<PredictionWorkResult | void>;

export interface NextRouteCandidateOptions {
  readonly key?: string;
  readonly policy?: string;
  readonly destination?: string;
  readonly probability: number;
  readonly horizonMs: number;
  readonly cost?: PredictionCost;
  readonly priority?: number;
  readonly estimatedBytes?: number;
}

interface PublicNextRouter {
  prefetch(href: string, options?: { onInvalidate?: () => void }): void;
}

export function prefetchWithNextRouter(
  router: unknown,
  href: string,
  onInvalidate: () => void,
): void {
  (router as PublicNextRouter).prefetch(href, { onInvalidate });
}

export function createNextRouteCandidate(
  href: string,
  trigger: string,
  options: NextRouteCandidateOptions,
): PredictionCandidate {
  return {
    key: options.key ?? `next-route:${href}`,
    policy: options.policy ?? "next-route",
    trigger,
    destination: options.destination ?? href,
    probability: options.probability,
    horizonMs: options.horizonMs,
    ...(options.cost === undefined ? {} : { cost: options.cost }),
    ...(options.priority === undefined ? {} : { priority: options.priority }),
    ...(options.estimatedBytes === undefined
      ? {}
      : { estimatedBytes: options.estimatedBytes }),
  };
}
