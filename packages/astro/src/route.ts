import type { PredictionCandidate, PredictionCost } from "@inttegro/cogni-client";
import { createPredictionCandidate } from "@inttegro/cogni-client";

export type AstroIntentTrigger = "hover" | "focus" | "pointer" | "touch";

export interface AstroRouteCandidateOptions {
  readonly key?: string;
  readonly policy?: string;
  readonly destination?: string;
  readonly probability?: number;
  readonly horizonMs?: number;
  readonly cost?: PredictionCost;
  readonly priority?: number;
  readonly estimatedBytes?: number;
}

export interface AstroLinkPredictionOptions extends AstroRouteCandidateOptions {
  readonly enabled?: boolean;
  readonly hoverDelayMs?: number;
  readonly maxDeferMs?: number;
}

export interface AstroLinkAttributes {
  readonly "data-astro-prefetch": "false";
  readonly "data-cogni-astro": "" | "false";
  readonly "data-cogni-probability": string;
  readonly "data-cogni-horizon-ms": string;
  readonly "data-cogni-key"?: string;
  readonly "data-cogni-policy"?: string;
  readonly "data-cogni-destination"?: string;
  readonly "data-cogni-cost"?: PredictionCost;
  readonly "data-cogni-priority"?: string;
  readonly "data-cogni-estimated-bytes"?: string;
  readonly "data-cogni-hover-delay-ms"?: string;
  readonly "data-cogni-max-defer-ms"?: string;
}

export function createAstroRouteCandidate(
  href: string,
  trigger: AstroIntentTrigger,
  options: AstroRouteCandidateOptions,
  baseHref?: string,
): PredictionCandidate {
  const route = normalizeAstroRoute(href, baseHref);
  return createPredictionCandidate({
    key: options.key ?? `astro-route:${route}`,
    policy: options.policy ?? "astro-route",
    trigger,
    destination: options.destination ?? route,
    ...(options.probability === undefined ? {} : { probability: options.probability }),
    ...(options.horizonMs === undefined ? {} : { horizonMs: options.horizonMs }),
    ...(options.cost === undefined ? {} : { cost: options.cost }),
    ...(options.priority === undefined ? {} : { priority: options.priority }),
    ...(options.estimatedBytes === undefined
      ? {}
      : { estimatedBytes: options.estimatedBytes }),
  });
}

/** Data attributes consumed by the delegated Astro runtime. */
export function createAstroLinkAttributes(
  options: AstroLinkPredictionOptions,
): AstroLinkAttributes {
  const candidate = createPredictionCandidate({
    key: "astro-link",
    ...(options.probability === undefined ? {} : { probability: options.probability }),
    ...(options.horizonMs === undefined ? {} : { horizonMs: options.horizonMs }),
    ...(options.cost === undefined ? {} : { cost: options.cost }),
  });
  return {
    // Prevent Astro's built-in prefetcher from duplicating Cogni's admitted work.
    "data-astro-prefetch": "false",
    "data-cogni-astro": options.enabled === false ? "false" : "",
    "data-cogni-probability": String(candidate.probability),
    "data-cogni-horizon-ms": String(candidate.horizonMs),
    ...(options.key === undefined ? {} : { "data-cogni-key": options.key }),
    ...(options.policy === undefined ? {} : { "data-cogni-policy": options.policy }),
    ...(options.destination === undefined
      ? {}
      : { "data-cogni-destination": options.destination }),
    ...(options.cost === undefined ? {} : { "data-cogni-cost": options.cost }),
    ...(options.priority === undefined
      ? {}
      : { "data-cogni-priority": String(options.priority) }),
    ...(options.estimatedBytes === undefined
      ? {}
      : { "data-cogni-estimated-bytes": String(options.estimatedBytes) }),
    ...(options.hoverDelayMs === undefined
      ? {}
      : { "data-cogni-hover-delay-ms": String(options.hoverDelayMs) }),
    ...(options.maxDeferMs === undefined
      ? {}
      : { "data-cogni-max-defer-ms": String(options.maxDeferMs) }),
  };
}

export function normalizeAstroRoute(href: string, baseHref?: string): string {
  const fallbackBase = baseHref ?? globalThis.location?.href;
  if (!fallbackBase) {
    throw new TypeError("baseHref is required outside a browser");
  }

  const route = new URL(href, fallbackBase);
  route.hash = "";
  return route.href;
}
