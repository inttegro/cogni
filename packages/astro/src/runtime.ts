import {
  PredictionScheduler,
  type PredictionCandidate,
  type PredictionScheduler as PredictionSchedulerInstance,
  type PredictionWorkResult,
  type ScheduledPrediction,
} from "@inttegro/cogni-client";
import {
  createBrowserPredictionCalibration,
  createBrowserPredictionSchedulerRuntime,
  observeBrowserPredictionEnvironment,
  type ObservableBrowserPredictionEnvironment,
} from "@inttegro/cogni-client/browser";
import {
  createAstroRouteCandidate,
  normalizeAstroRoute,
  type AstroIntentTrigger,
  type AstroRouteCandidateOptions,
} from "./route";

const DEFAULT_HOVER_DELAY_MS = 120;
const LINK_SELECTOR = "a[data-cogni-astro]";

export interface AstroRoutePrefetchContext {
  readonly signal: AbortSignal;
  readonly candidate: Readonly<PredictionCandidate>;
  readonly source: HTMLAnchorElement;
}

export type AstroRoutePrefetch = (
  href: string,
  context: AstroRoutePrefetchContext,
) => PredictionWorkResult | void | Promise<PredictionWorkResult | void>;

export interface AstroPredictionRuntimeOptions {
  /** The route prefetch implementation whose cache Astro navigation reuses. */
  readonly prefetchRoute: AstroRoutePrefetch;
  /** Opaque stable key for the authenticated account. Learning is automatic. */
  readonly opaqueUserKey?: string;
  /** A host-owned scheduler. Cogni never disposes a scheduler supplied here. */
  readonly scheduler?: PredictionSchedulerInstance;
  /** Creates a runtime-owned scheduler with custom coordinator limits or telemetry. */
  readonly createScheduler?: () => PredictionSchedulerInstance;
  readonly document?: Document;
  readonly window?: Window;
  readonly observeBrowserEnvironment?: boolean;
  readonly onError?: (error: unknown) => void;
}

interface ActiveRoutePrediction {
  readonly anchor: HTMLAnchorElement;
  readonly route: string;
  readonly trigger: AstroIntentTrigger;
  readonly scheduled: ScheduledPrediction;
}

interface AstroBeforePreparationEvent extends Event {
  readonly to?: URL;
}

/**
 * Delegates intent handling at the document boundary so it survives Astro
 * ClientRouter swaps without rebinding every link on each page.
 */
export class AstroPredictionRuntime {
  readonly #document: Document;
  readonly #window: Window;
  readonly #scheduler: PredictionSchedulerInstance;
  readonly #ownsScheduler: boolean;
  readonly #prefetchRoute: AstroRoutePrefetch;
  readonly #observeBrowserEnvironment: boolean;
  readonly #onError: ((error: unknown) => void) | undefined;
  readonly #active = new Map<string, ActiveRoutePrediction>();
  #stopObserving: (() => void) | null = null;
  #started = false;
  #disposed = false;

  constructor(options: AstroPredictionRuntimeOptions) {
    if (typeof options?.prefetchRoute !== "function") {
      throw new TypeError("prefetchRoute must be a function");
    }
    if (options.scheduler && options.createScheduler) {
      throw new TypeError("scheduler and createScheduler are mutually exclusive");
    }
    if (
      !options.scheduler &&
      !options.createScheduler &&
      !options.opaqueUserKey?.trim()
    ) {
      throw new TypeError(
        "opaqueUserKey is required when AstroPredictionRuntime creates the scheduler",
      );
    }

    const document = options.document ?? globalThis.document;
    const window = options.window ?? document?.defaultView ?? globalThis.window;
    if (!document || !window) {
      throw new TypeError("an Astro browser document and window are required");
    }

    this.#document = document;
    this.#window = window;
    this.#prefetchRoute = options.prefetchRoute;
    this.#observeBrowserEnvironment = options.observeBrowserEnvironment ?? true;
    this.#onError = options.onError;
    this.#scheduler =
      options.scheduler ??
      options.createScheduler?.() ??
      new PredictionScheduler({
        calibration: createBrowserPredictionCalibration({
          opaqueUserKey: options.opaqueUserKey as string,
          location: this.#window.location,
        }),
        runtime: createBrowserPredictionSchedulerRuntime(),
        environmentAllowed: !this.#observeBrowserEnvironment,
      });
    this.#ownsScheduler = options.scheduler === undefined;
  }

  get scheduler(): PredictionSchedulerInstance {
    return this.#scheduler;
  }

  start(): this {
    if (this.#disposed) {
      throw new TypeError("an Astro prediction runtime cannot restart after disposal");
    }
    if (this.#started) return this;
    this.#started = true;

    this.#document.addEventListener("pointerover", this.#handlePointerOver);
    this.#document.addEventListener("pointerout", this.#handlePointerOut);
    this.#document.addEventListener("pointerdown", this.#handlePointerDown);
    this.#document.addEventListener("touchstart", this.#handleTouchStart);
    this.#document.addEventListener("focusin", this.#handleFocusIn);
    this.#document.addEventListener("focusout", this.#handleFocusOut);
    this.#document.addEventListener(
      "astro:before-preparation",
      this.#handleBeforePreparation as EventListener,
    );
    this.#document.addEventListener("astro:page-load", this.#handlePageLoad);

    if (this.#observeBrowserEnvironment) {
      try {
        const environment: ObservableBrowserPredictionEnvironment = {
          document: this.#document,
          navigator: this.#window
            .navigator as ObservableBrowserPredictionEnvironment["navigator"],
        };
        this.#stopObserving = observeBrowserPredictionEnvironment((decision) => {
          this.#scheduler.setEnvironmentAllowed(decision.allowed);
        }, environment);
      } catch (error) {
        this.#scheduler.setEnvironmentAllowed(false);
        this.#reportError(error);
      }
    }

    return this;
  }

  stop(): void {
    if (!this.#started) return;
    this.#started = false;

    this.#document.removeEventListener("pointerover", this.#handlePointerOver);
    this.#document.removeEventListener("pointerout", this.#handlePointerOut);
    this.#document.removeEventListener("pointerdown", this.#handlePointerDown);
    this.#document.removeEventListener("touchstart", this.#handleTouchStart);
    this.#document.removeEventListener("focusin", this.#handleFocusIn);
    this.#document.removeEventListener("focusout", this.#handleFocusOut);
    this.#document.removeEventListener(
      "astro:before-preparation",
      this.#handleBeforePreparation as EventListener,
    );
    this.#document.removeEventListener("astro:page-load", this.#handlePageLoad);
    this.#stopObserving?.();
    this.#stopObserving = null;

    for (const active of this.#active.values()) active.scheduled.cancel();
    this.#active.clear();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.stop();
    this.#disposed = true;
    if (this.#ownsScheduler) this.#scheduler.dispose();
  }

  readonly #handlePointerOver = (event: PointerEvent): void => {
    if (event.pointerType === "touch") return;
    const anchor = this.#anchorFor(event.target);
    if (!anchor || this.#enteredFromInside(anchor, event.relatedTarget)) return;
    this.#schedule(anchor, "hover", false);
  };

  readonly #handlePointerOut = (event: PointerEvent): void => {
    const anchor = this.#anchorFor(event.target);
    if (!anchor || this.#enteredFromInside(anchor, event.relatedTarget)) return;
    if (this.#document.activeElement !== anchor) this.#cancelFor(anchor);
  };

  readonly #handlePointerDown = (event: PointerEvent): void => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    const anchor = this.#anchorFor(event.target);
    if (anchor) this.#schedule(anchor, "pointer", true);
  };

  readonly #handleTouchStart = (event: TouchEvent): void => {
    const anchor = this.#anchorFor(event.target);
    if (anchor) this.#schedule(anchor, "touch", true);
  };

  readonly #handleFocusIn = (event: FocusEvent): void => {
    const anchor = this.#anchorFor(event.target);
    if (anchor) this.#schedule(anchor, "focus", true);
  };

  readonly #handleFocusOut = (event: FocusEvent): void => {
    const anchor = this.#anchorFor(event.target);
    if (!anchor || this.#enteredFromInside(anchor, event.relatedTarget)) return;
    this.#cancelFor(anchor);
  };

  readonly #handleBeforePreparation = (event: AstroBeforePreparationEvent): void => {
    const to = event.to;
    if (!to) return;

    const route = normalizeAstroRoute(to.href, this.#document.location.href);
    const active = [...this.#active.values()].find(
      (prediction) => prediction.route === route,
    );
    if (active) {
      active.scheduled.startNow();
      void active.scheduled.started
        .then((handle) => {
          handle?.markReused();
        })
        .catch((error: unknown) => this.#reportError(error));
    }

    this.#scheduler.setForegroundActivity(1);
  };

  readonly #handlePageLoad = (): void => {
    this.#scheduler.setForegroundActivity(0);
  };

  #schedule(
    anchor: HTMLAnchorElement,
    trigger: AstroIntentTrigger,
    immediate: boolean,
  ): void {
    let route: ParsedRoute;
    try {
      route = this.#parseRoute(anchor, trigger);
    } catch (error) {
      this.#reportError(error);
      return;
    }

    const existing = this.#active.get(route.candidate.key);
    if (existing?.scheduled.status === "started") return;
    if (existing?.scheduled.status === "pending" && !immediate) return;
    if (existing) {
      existing.scheduled.cancel();
      this.#active.delete(route.candidate.key);
    }

    const scheduled = this.#scheduler.schedule(
      route.candidate,
      ({ candidate, signal }) =>
        Promise.resolve(
          this.#prefetchRoute(route.route, { signal, candidate, source: anchor }),
        ),
      {
        delayMs: immediate ? 0 : route.hoverDelayMs,
        idle: false,
        allowDuringForeground: immediate,
        ...(route.maxDeferMs === undefined ? {} : { maxDeferMs: route.maxDeferMs }),
      },
    );
    const active: ActiveRoutePrediction = {
      anchor,
      route: route.route,
      trigger,
      scheduled,
    };
    this.#active.set(route.candidate.key, active);
    if (immediate) scheduled.startNow();

    void scheduled.started
      .then((handle) => {
        if (!handle) {
          this.#deleteIfCurrent(route.candidate.key, active);
          return;
        }
        return handle.completion.finally(() => {
          this.#deleteIfCurrent(route.candidate.key, active);
        });
      })
      .catch((error: unknown) => {
        this.#deleteIfCurrent(route.candidate.key, active);
        this.#reportError(error);
      });
  }

  #cancelFor(anchor: HTMLAnchorElement): void {
    for (const [key, active] of this.#active) {
      if (active.anchor !== anchor) continue;
      active.scheduled.cancel();
      this.#active.delete(key);
    }
  }

  #parseRoute(anchor: HTMLAnchorElement, trigger: AstroIntentTrigger): ParsedRoute {
    if (anchor.dataset.cogniAstro === "false") {
      throw new TypeError("disabled Cogni links cannot be scheduled");
    }
    if (anchor.download || (anchor.target && anchor.target !== "_self")) {
      throw new TypeError("Cogni only predicts same-context navigation");
    }

    const route = normalizeAstroRoute(anchor.href, this.#document.location.href);
    const target = new URL(route);
    if (target.origin !== this.#document.location.origin) {
      throw new TypeError("Cogni only predicts same-origin Astro routes");
    }

    const probability = requiredNumber(
      anchor.dataset.cogniProbability,
      "data-cogni-probability",
    );
    if (probability < 0 || probability > 1) {
      throw new TypeError("data-cogni-probability must be between 0 and 1");
    }
    const horizonMs = requiredNumber(
      anchor.dataset.cogniHorizonMs,
      "data-cogni-horizon-ms",
    );
    if (horizonMs <= 0) {
      throw new TypeError("data-cogni-horizon-ms must be greater than zero");
    }

    const candidateOptions: AstroRouteCandidateOptions = {
      probability,
      horizonMs,
      ...(anchor.dataset.cogniKey === undefined
        ? {}
        : { key: anchor.dataset.cogniKey }),
      ...(anchor.dataset.cogniPolicy === undefined
        ? {}
        : { policy: anchor.dataset.cogniPolicy }),
      ...(anchor.dataset.cogniDestination === undefined
        ? {}
        : { destination: anchor.dataset.cogniDestination }),
      ...(anchor.dataset.cogniCost === undefined
        ? {}
        : { cost: predictionCost(anchor.dataset.cogniCost) }),
      ...optionalNumberProperty(anchor.dataset.cogniPriority, "priority"),
      ...optionalNumberProperty(anchor.dataset.cogniEstimatedBytes, "estimatedBytes"),
    };

    return {
      route,
      candidate: createAstroRouteCandidate(
        route,
        trigger,
        candidateOptions,
        this.#document.location.href,
      ),
      hoverDelayMs:
        optionalNumber(anchor.dataset.cogniHoverDelayMs, "data-cogni-hover-delay-ms") ??
        DEFAULT_HOVER_DELAY_MS,
      maxDeferMs: optionalNumber(
        anchor.dataset.cogniMaxDeferMs,
        "data-cogni-max-defer-ms",
      ),
    };
  }

  #anchorFor(target: EventTarget | null): HTMLAnchorElement | null {
    if (!target || typeof (target as Element).closest !== "function") return null;
    const anchor = (target as Element).closest(LINK_SELECTOR);
    return anchor?.tagName === "A" ? (anchor as HTMLAnchorElement) : null;
  }

  #enteredFromInside(anchor: HTMLAnchorElement, related: EventTarget | null): boolean {
    return (
      related !== null &&
      typeof (related as Node).nodeType === "number" &&
      anchor.contains(related as Node)
    );
  }

  #deleteIfCurrent(key: string, active: ActiveRoutePrediction): void {
    if (this.#active.get(key) === active) this.#active.delete(key);
  }

  #reportError(error: unknown): void {
    try {
      this.#onError?.(error);
    } catch {
      // Telemetry must never interfere with navigation.
    }
  }
}

interface ParsedRoute {
  readonly route: string;
  readonly candidate: PredictionCandidate;
  readonly hoverDelayMs: number;
  readonly maxDeferMs: number | undefined;
}

export function createAstroPredictionRuntime(
  options: AstroPredictionRuntimeOptions,
): AstroPredictionRuntime {
  return new AstroPredictionRuntime(options);
}

function requiredNumber(value: string | undefined, name: string): number {
  if (value === undefined || value === "") {
    throw new TypeError(`${name} is required`);
  }
  return finiteNonNegative(Number(value), name);
}

function optionalNumber(value: string | undefined, name: string): number | undefined {
  if (value === undefined || value === "") return undefined;
  return finiteNonNegative(Number(value), name);
}

function optionalNumberProperty<Key extends "priority" | "estimatedBytes">(
  value: string | undefined,
  key: Key,
): { [Property in Key]?: number } {
  const parsed = optionalNumber(value, `data-cogni-${camelToKebab(key)}`);
  return parsed === undefined
    ? {}
    : ({ [key]: parsed } as { [Property in Key]: number });
}

function finiteNonNegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative finite number`);
  }
  return value;
}

function predictionCost(value: string): "low" | "standard" | "high" {
  if (value === "low" || value === "standard" || value === "high") return value;
  throw new TypeError("data-cogni-cost must be low, standard, or high");
}

function camelToKebab(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}
