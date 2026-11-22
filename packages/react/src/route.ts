import type {
  PredictionCandidate,
  PredictionCost,
  PredictionWorkResult,
} from "@inttegro/cogni-client";

export type RouteIntentTrigger = "hover" | "focus" | "pointer" | "touch" | "click";

export interface RoutePrefetchContext {
  readonly signal: AbortSignal;
}

/** A router or host cache operation that makes one destination reusable. */
export type RoutePrefetch = (
  href: string,
  context: RoutePrefetchContext,
) => PredictionWorkResult | void | Promise<PredictionWorkResult | void>;

export interface RouteCandidateOptions {
  readonly key?: string;
  readonly policy?: string;
  readonly destination?: string;
  readonly probability: number;
  readonly horizonMs: number;
  readonly cost?: PredictionCost;
  readonly priority?: number;
  readonly estimatedBytes?: number;
}

export function createRouteCandidate(
  href: string,
  trigger: RouteIntentTrigger,
  options: RouteCandidateOptions,
): PredictionCandidate {
  return {
    key: options.key ?? `route:${href}`,
    policy: options.policy ?? "route-intent",
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
