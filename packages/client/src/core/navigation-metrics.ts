export interface NavigationMetric {
  readonly key: string;
  readonly navigationStartedAt: number;
  readonly navigationCompletedAt: number;
  readonly navigationDurationMs: number;
  readonly prefetchStartedAt?: number;
  readonly prefetchSettledAt?: number;
  readonly prefetchDurationMs?: number;
  readonly prefetchLeadMs?: number;
  readonly prefetchSettledBeforeNavigation: boolean;
}

export interface NavigationMetricsOptions {
  readonly now?: () => number;
  readonly maxPending?: number;
  readonly ttlMs?: number;
  readonly onComplete?: (metric: NavigationMetric) => void;
}

interface NavigationRecord {
  updatedAt: number;
  prefetchStartedAt?: number;
  prefetchSettledAt?: number;
  navigationStartedAt?: number;
}

/**
 * Measures whether predictive work was early enough to help committed
 * navigation. It deliberately knows nothing about analytics vendors or route
 * frameworks; hosts receive completed metrics through onComplete.
 */
export class NavigationMetrics {
  readonly #now: () => number;
  readonly #maxPending: number;
  readonly #ttlMs: number;
  readonly #onComplete: ((metric: NavigationMetric) => void) | undefined;
  readonly #records = new Map<string, NavigationRecord>();

  constructor(options: NavigationMetricsOptions = {}) {
    this.#now = options.now ?? Date.now;
    this.#maxPending = positiveInteger(options.maxPending ?? 24, "maxPending");
    this.#ttlMs = positiveFinite(options.ttlMs ?? 120_000, "ttlMs");
    this.#onComplete = options.onComplete;
  }

  recordPrefetchStarted(key: string, at = this.#now()): void {
    const record = this.#record(key, at);
    record.prefetchStartedAt ??= at;
    record.updatedAt = at;
  }

  recordPrefetchSettled(key: string, at = this.#now()): void {
    const record = this.#record(key, at);
    record.prefetchStartedAt ??= at;
    record.prefetchSettledAt = at;
    record.updatedAt = at;
  }

  recordNavigationStarted(key: string, at = this.#now()): void {
    const record = this.#record(key, at);
    record.navigationStartedAt ??= at;
    record.updatedAt = at;
  }

  recordNavigationCompleted(
    key: string,
    at = this.#now(),
  ): NavigationMetric | undefined {
    this.#prune(at);
    const record = this.#records.get(key);
    if (record?.navigationStartedAt === undefined) return undefined;

    this.#records.delete(key);
    const metric: NavigationMetric = {
      key,
      navigationStartedAt: record.navigationStartedAt,
      navigationCompletedAt: at,
      navigationDurationMs: Math.max(0, at - record.navigationStartedAt),
      ...(record.prefetchStartedAt === undefined
        ? {}
        : { prefetchStartedAt: record.prefetchStartedAt }),
      ...(record.prefetchSettledAt === undefined
        ? {}
        : { prefetchSettledAt: record.prefetchSettledAt }),
      ...(record.prefetchStartedAt === undefined ||
      record.prefetchSettledAt === undefined
        ? {}
        : {
            prefetchDurationMs: Math.max(
              0,
              record.prefetchSettledAt - record.prefetchStartedAt,
            ),
          }),
      ...(record.prefetchStartedAt === undefined
        ? {}
        : {
            prefetchLeadMs: Math.max(
              0,
              record.navigationStartedAt - record.prefetchStartedAt,
            ),
          }),
      prefetchSettledBeforeNavigation:
        record.prefetchSettledAt !== undefined &&
        record.prefetchSettledAt <= record.navigationStartedAt,
    };
    try {
      this.#onComplete?.(metric);
    } catch {
      // Telemetry must not affect navigation.
    }
    return metric;
  }

  clear(key?: string): void {
    if (key === undefined) this.#records.clear();
    else this.#records.delete(key);
  }

  #record(key: string, at: number): NavigationRecord {
    if (!key.trim()) throw new TypeError("key must not be empty");
    this.#prune(at);
    let record = this.#records.get(key);
    if (!record) {
      while (this.#records.size >= this.#maxPending) {
        const oldest = this.#records.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        this.#records.delete(oldest);
      }
      record = { updatedAt: at };
      this.#records.set(key, record);
    }
    return record;
  }

  #prune(at: number): void {
    for (const [key, record] of this.#records) {
      if (at - record.updatedAt >= this.#ttlMs) this.#records.delete(key);
    }
  }
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return value;
}

function positiveFinite(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be greater than 0`);
  }
  return value;
}
