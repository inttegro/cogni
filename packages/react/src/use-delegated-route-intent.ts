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

const DEFAULT_ROUTE_SELECTOR = "a[href]";

export interface DelegatedRouteIntentContext {
  readonly source: Element;
  readonly href: string;
  readonly currentHref: string;
  readonly trigger: RouteIntentTrigger;
}

export type DelegatedRouteHrefResolver = (
  source: Element,
  currentHref: string,
) => string | null;

export type DelegatedRouteCandidateResolver = (
  context: DelegatedRouteIntentContext,
) => Partial<RouteCandidateOptions> | false | null | undefined;

export interface UseDelegatedRouteIntentOptions extends Omit<
  RouteCandidateOptions,
  "key" | "destination"
> {
  /** Observe ordinary anchors by default; hosts may include link-like rows. */
  readonly selector?: string;
  /** Limit discovery to one subtree. Defaults to the current document. */
  readonly root?: Document | Element | null;
  readonly enabled?: boolean;
  readonly hoverDelayMs?: number;
  readonly maxDeferMs?: number;
  /** Keep admitted route work alive if the observer unmounts during navigation. */
  readonly retainOnUnmount?: boolean;
  readonly prefetchRoute: RoutePrefetch;
  /** Resolve and authorize a discovered source. Defaults to same-origin anchors. */
  readonly resolveHref?: DelegatedRouteHrefResolver;
  /** Refine or reject the candidate without maintaining a central link list. */
  readonly resolveCandidate?: DelegatedRouteCandidateResolver;
  readonly getCurrentHref?: () => string;
  /** Called only when Cogni actually begins the reusable route operation. */
  readonly onPrefetch?: (context: DelegatedRouteIntentContext) => void;
  /** Called for an unmodified primary click; this is intent, not route commitment. */
  readonly onNavigationIntent?: (context: DelegatedRouteIntentContext) => void;
}

export interface DelegatedRouteIntentActions {
  /** Attribute reuse only after the router confirms this destination committed. */
  markReused(href: string): Promise<boolean>;
  cancel(href?: string): void;
}

interface ActiveRoutePrediction {
  readonly context: DelegatedRouteIntentContext;
  readonly scheduled: ScheduledPrediction;
}

interface StartedRouteIntent {
  readonly context: DelegatedRouteIntentContext;
  readonly active: ActiveRoutePrediction;
}

/**
 * Discovers rendered links through event delegation and schedules their route
 * work through Cogni. Discovery is dynamic; candidate policy remains explicit.
 */
export function useDelegatedRouteIntent(
  options: UseDelegatedRouteIntentOptions,
): DelegatedRouteIntentActions {
  const scheduler = useCogniScheduler();
  const optionsRef = useRef(options);
  const activeRef = useRef(new Map<string, ActiveRoutePrediction>());
  optionsRef.current = options;

  const cancel = useCallback((href?: string) => {
    if (href !== undefined) {
      const active = activeRef.current.get(href);
      active?.scheduled.cancel();
      activeRef.current.delete(href);
      return;
    }

    for (const active of activeRef.current.values()) active.scheduled.cancel();
    activeRef.current.clear();
  }, []);

  const markReused = useCallback(async (href: string) => {
    const active = activeRef.current.get(href);
    if (!active) return false;

    active.scheduled.startNow();
    const handle = await active.scheduled.started;
    return handle?.markReused() ?? false;
  }, []);

  useEffect(() => {
    if (!options.enabled && options.enabled !== undefined) return undefined;
    if (typeof document === "undefined" || typeof window === "undefined") {
      return undefined;
    }

    const root = options.root ?? document;
    const selector = options.selector ?? DEFAULT_ROUTE_SELECTOR;
    let pointerSource: Element | null = null;
    let pointerHref: string | null = null;

    function currentHref() {
      return optionsRef.current.getCurrentHref?.() ?? window.location.href;
    }

    function sourceForTarget(target: EventTarget | null): Element | null {
      if (!(target instanceof Element)) return null;
      const source = target.closest(selector);
      if (!source) return null;
      if (root instanceof Element && !root.contains(source)) return null;
      return source;
    }

    function contextForSource(
      source: Element,
      trigger: RouteIntentTrigger,
    ): DelegatedRouteIntentContext | null {
      const location = currentHref();
      const href = (optionsRef.current.resolveHref ?? resolveAnchorHref)(
        source,
        location,
      );
      if (!href) return null;
      return { source, href, currentHref: location, trigger };
    }

    function start(
      source: Element,
      trigger: RouteIntentTrigger,
      immediate: boolean,
    ): StartedRouteIntent | null {
      const context = contextForSource(source, trigger);
      if (!context) return null;

      const existing = activeRef.current.get(context.href);
      if (existing?.scheduled.status === "started") {
        return { context, active: existing };
      }
      if (existing?.scheduled.status === "pending" && !immediate) {
        return { context, active: existing };
      }
      if (existing) {
        existing.scheduled.cancel();
        activeRef.current.delete(context.href);
      }

      const current = optionsRef.current;
      const candidateOverride = current.resolveCandidate?.(context);
      if (candidateOverride === false || candidateOverride === null) return null;

      const candidateOptions: RouteCandidateOptions = {
        ...(current.probability === undefined
          ? {}
          : { probability: current.probability }),
        ...(current.horizonMs === undefined ? {} : { horizonMs: current.horizonMs }),
        ...(current.policy === undefined ? {} : { policy: current.policy }),
        ...(current.cost === undefined ? {} : { cost: current.cost }),
        ...(current.priority === undefined ? {} : { priority: current.priority }),
        ...(current.estimatedBytes === undefined
          ? {}
          : { estimatedBytes: current.estimatedBytes }),
        ...candidateOverride,
      };
      const candidate = createRouteCandidate(context.href, trigger, candidateOptions);
      const scheduled = scheduler.schedule(
        candidate,
        async ({ signal }) => {
          optionsRef.current.onPrefetch?.(context);
          return optionsRef.current.prefetchRoute(context.href, { signal });
        },
        {
          delayMs: immediate ? 0 : (current.hoverDelayMs ?? 120),
          idle: false,
          allowDuringForeground: immediate,
          ...(current.maxDeferMs === undefined
            ? {}
            : { maxDeferMs: current.maxDeferMs }),
        },
      );
      const active = { context, scheduled };
      activeRef.current.set(context.href, active);
      if (immediate) scheduled.startNow();

      void scheduled.started.then((handle) => {
        if (!handle) {
          if (activeRef.current.get(context.href) === active) {
            activeRef.current.delete(context.href);
          }
          return;
        }

        void handle.completion.then(() => {
          if (activeRef.current.get(context.href) === active) {
            activeRef.current.delete(context.href);
          }
        });
      });

      return { context, active };
    }

    function runIntent(event: Event, trigger: Exclude<RouteIntentTrigger, "hover">) {
      const source = sourceForTarget(event.target);
      if (!source) return null;
      cancelPointerIntent();
      return start(source, trigger, true);
    }

    function cancelPointerIntent() {
      if (pointerHref) {
        const active = activeRef.current.get(pointerHref);
        if (active?.scheduled.status === "pending") {
          active.scheduled.cancel();
          activeRef.current.delete(pointerHref);
        }
      }
      pointerSource = null;
      pointerHref = null;
    }

    function handlePointerOver(event: Event) {
      if ("pointerType" in event && event.pointerType === "touch") return;
      const source = sourceForTarget(event.target);
      if (!source || source === pointerSource) return;

      cancelPointerIntent();
      const started = start(source, "hover", false);
      if (!started) return;
      pointerSource = source;
      pointerHref = started.context.href;
    }

    function handlePointerOut(event: Event) {
      if (!pointerSource) return;
      const relatedTarget =
        "relatedTarget" in event && event.relatedTarget instanceof Node
          ? event.relatedTarget
          : null;
      if (relatedTarget && pointerSource.contains(relatedTarget)) return;
      cancelPointerIntent();
    }

    function handlePointerDown(event: Event) {
      runIntent(event, "pointer");
    }

    function handleFocusIn(event: Event) {
      runIntent(event, "focus");
    }

    function handleTouchStart(event: Event) {
      runIntent(event, "touch");
    }

    function handleClick(event: Event) {
      const started = runIntent(event, "click");
      if (started && isDirectNavigationClick(event)) {
        optionsRef.current.onNavigationIntent?.(started.context);
      }
    }

    root.addEventListener("pointerover", handlePointerOver);
    root.addEventListener("pointerout", handlePointerOut);
    root.addEventListener("pointerdown", handlePointerDown);
    root.addEventListener("focusin", handleFocusIn);
    root.addEventListener("touchstart", handleTouchStart, { passive: true });
    root.addEventListener("click", handleClick, true);

    return () => {
      cancelPointerIntent();
      root.removeEventListener("pointerover", handlePointerOver);
      root.removeEventListener("pointerout", handlePointerOut);
      root.removeEventListener("pointerdown", handlePointerDown);
      root.removeEventListener("focusin", handleFocusIn);
      root.removeEventListener("touchstart", handleTouchStart);
      root.removeEventListener("click", handleClick, true);
      if (!optionsRef.current.retainOnUnmount) cancel();
    };
  }, [cancel, options.enabled, options.root, options.selector, scheduler]);

  return { markReused, cancel };
}

export function resolveAnchorHref(source: Element, currentHref: string): string | null {
  if (!(source instanceof HTMLAnchorElement)) return null;
  if (source.hasAttribute("download") || source.target === "_blank") return null;

  const rawHref = source.getAttribute("href");
  if (!rawHref || rawHref.startsWith("#")) return null;

  try {
    const current = new URL(currentHref);
    const destination = new URL(rawHref, current);
    if (destination.origin !== current.origin) return null;
    if (destination.protocol !== "http:" && destination.protocol !== "https:") {
      return null;
    }
    if (
      destination.pathname === current.pathname &&
      destination.search === current.search
    ) {
      return null;
    }
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return null;
  }
}

function isDirectNavigationClick(event: Event) {
  return (
    event instanceof MouseEvent &&
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}
