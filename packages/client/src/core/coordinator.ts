import type {
  PredictionCancellationReason,
  PredictionCandidate,
  PredictionCoordinatorOptions,
  PredictionEvent,
  PredictionEventListener,
  PredictionHandle,
  PredictionLoader,
  PredictionQualityFilter,
  PredictionQualitySnapshot,
  PredictionRejectionReason,
  PredictionRuntime,
  PredictionScheduledTask,
  PredictionStatus,
  PredictionTerminalResult,
  PredictionWorkResult,
  RequiredPredictionCandidate,
} from "./types";

const DEFAULT_MINIMUM_PROBABILITY = 0.8;
const DEFAULT_HIGH_COST_MINIMUM_PROBABILITY = 0.9;
const DEFAULT_MAX_CONCURRENT = 2;
const DEFAULT_MAX_QUEUED = 16;
const DEFAULT_MAX_HISTORY = 1_000;
const SYSTEM_RUNTIME: PredictionRuntime = {
  now: () => Date.now(),
  schedule(delayMs, task) {
    const timer = setTimeout(task, delayMs);
    return { cancel: () => clearTimeout(timer) };
  },
};

interface PredictionRecord {
  candidate: Readonly<RequiredPredictionCandidate>;
  loader: PredictionLoader;
  sequence: number;
  acceptedAt: number;
  deadlineAt: number;
  status: PredictionStatus;
  controller: AbortController;
  materialWork: boolean;
  bytes: number;
  startedAt?: number;
  loadedAt?: number;
  reusedAt?: number;
  expiryTask: PredictionScheduledTask | null;
  completion: Promise<PredictionTerminalResult>;
  resolveCompletion: (result: PredictionTerminalResult) => void;
}

type HistoryEntry = PredictionTerminalResult;

export class PredictionCoordinator {
  readonly #minimumProbability: number;
  readonly #highCostMinimumProbability: number;
  readonly #maxConcurrent: number;
  readonly #maxQueued: number;
  readonly #maxHistory: number;
  readonly #runtime: PredictionRuntime;
  readonly #onEvent: ((event: PredictionEvent) => void) | undefined;
  readonly #listeners = new Set<PredictionEventListener>();
  readonly #active = new Map<string, PredictionRecord>();
  readonly #queue: PredictionRecord[] = [];
  readonly #history: HistoryEntry[] = [];
  #sequence = 0;
  #running = 0;
  #disposed = false;

  constructor(options: PredictionCoordinatorOptions = {}) {
    this.#minimumProbability = probabilityOption(
      options.minimumProbability,
      DEFAULT_MINIMUM_PROBABILITY,
      "minimumProbability",
    );
    this.#highCostMinimumProbability = probabilityOption(
      options.highCostMinimumProbability,
      Math.max(DEFAULT_HIGH_COST_MINIMUM_PROBABILITY, this.#minimumProbability),
      "highCostMinimumProbability",
    );
    if (this.#highCostMinimumProbability < this.#minimumProbability) {
      throw new TypeError(
        "highCostMinimumProbability must be at least minimumProbability",
      );
    }
    this.#maxConcurrent = positiveIntegerOption(
      options.maxConcurrent,
      DEFAULT_MAX_CONCURRENT,
      "maxConcurrent",
    );
    this.#maxQueued = nonNegativeIntegerOption(
      options.maxQueued,
      DEFAULT_MAX_QUEUED,
      "maxQueued",
    );
    this.#maxHistory = positiveIntegerOption(
      options.maxHistory,
      DEFAULT_MAX_HISTORY,
      "maxHistory",
    );
    this.#runtime = options.runtime ?? SYSTEM_RUNTIME;
    this.#onEvent = options.onEvent;
  }

  predict(
    candidateInput: PredictionCandidate,
    loader: PredictionLoader,
  ): PredictionHandle {
    const candidate = normalizeCandidate(candidateInput);
    const existing = this.#active.get(candidate.key);
    if (existing) {
      this.#emit({
        type: "deduplicated",
        at: this.#runtime.now(),
        candidate: existing.candidate,
      });
      return this.#handle(existing, true, true);
    }

    if (this.#disposed) {
      return this.#rejectedHandle(candidate, "disposed");
    }

    const minimumProbability =
      candidate.cost === "high"
        ? this.#highCostMinimumProbability
        : this.#minimumProbability;
    if (candidate.probability < minimumProbability) {
      return this.#rejectedHandle(candidate, "below_quality_gate");
    }

    if (this.#running >= this.#maxConcurrent && this.#queue.length >= this.#maxQueued) {
      return this.#rejectedHandle(candidate, "queue_full");
    }

    const acceptedAt = this.#runtime.now();
    let resolveCompletion!: (result: PredictionTerminalResult) => void;
    const completion = new Promise<PredictionTerminalResult>((resolve) => {
      resolveCompletion = resolve;
    });
    const record: PredictionRecord = {
      candidate,
      loader,
      sequence: this.#sequence++,
      acceptedAt,
      deadlineAt: acceptedAt + candidate.horizonMs,
      status: "queued",
      controller: new AbortController(),
      materialWork: false,
      bytes: candidate.estimatedBytes,
      expiryTask: null,
      completion,
      resolveCompletion,
    };

    this.#active.set(candidate.key, record);
    this.#queue.push(record);
    record.expiryTask = this.#runtime.schedule(
      Math.max(0, record.deadlineAt - this.#runtime.now()),
      () => this.#expire(record),
    );
    this.#emit({ type: "accepted", at: acceptedAt, candidate });
    this.#drain();
    return this.#handle(record, true, false);
  }

  markReused(key: string): boolean {
    const record = this.#active.get(key);
    if (!record || record.status === "terminal") return false;

    if (record.status === "queued") {
      this.#cancel(record, "superseded_by_committed_action");
      return false;
    }

    if (record.reusedAt === undefined) {
      record.reusedAt = this.#runtime.now();
      this.#emit({
        type: "reused",
        at: record.reusedAt,
        candidate: record.candidate,
        materialWork: record.materialWork,
        bytes: record.bytes,
      });
    }

    if (record.status === "waiting_for_reuse") {
      this.#finalize(record, "reused");
    }
    return true;
  }

  cancel(key: string): void {
    const record = this.#active.get(key);
    if (record) this.#cancel(record, "cancelled_by_host");
  }

  quality(filter: PredictionQualityFilter = {}): PredictionQualitySnapshot {
    const entries = this.#history.filter((entry) => matchesFilter(entry, filter));
    let materialOutcomes = 0;
    let reused = 0;
    let missed = 0;
    let failed = 0;
    let cancelledWithWork = 0;
    let cancelledWithoutWork = 0;
    let expiredWithoutWork = 0;
    let rejected = 0;
    let totalBytes = 0;
    let reusedBytes = 0;

    for (const entry of entries) {
      if (entry.outcome === "rejected") rejected += 1;
      if (entry.outcome === "expired" && !entry.materialWork) {
        expiredWithoutWork += 1;
      }
      if (entry.outcome === "cancelled") {
        if (entry.materialWork) cancelledWithWork += 1;
        else cancelledWithoutWork += 1;
      }
      if (entry.materialWork) {
        materialOutcomes += 1;
        totalBytes += entry.bytes;
        if (entry.outcome === "reused") {
          reused += 1;
          reusedBytes += entry.bytes;
        } else if (entry.outcome === "missed") {
          missed += 1;
        } else if (entry.outcome === "failed") {
          failed += 1;
        }
      }
    }

    return {
      outcomes: entries.length,
      materialOutcomes,
      reused,
      missed,
      failed,
      cancelledWithWork,
      cancelledWithoutWork,
      expiredWithoutWork,
      rejected,
      totalBytes,
      reusedBytes,
      reuseRate: materialOutcomes === 0 ? null : reused / materialOutcomes,
      byteReuseRate: totalBytes === 0 ? null : reusedBytes / totalBytes,
    };
  }

  subscribe(listener: PredictionEventListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const record of [...this.#active.values()]) {
      this.#cancel(record, "coordinator_disposed");
    }
  }

  #handle(
    record: PredictionRecord,
    accepted: boolean,
    deduplicated: boolean,
  ): PredictionHandle {
    return {
      candidate: record.candidate,
      accepted,
      deduplicated,
      get status() {
        return record.status;
      },
      completion: record.completion,
      markReused: () => this.markReused(record.candidate.key),
      cancel: () => this.cancel(record.candidate.key),
    };
  }

  #rejectedHandle(
    candidate: Readonly<RequiredPredictionCandidate>,
    reason: PredictionRejectionReason,
  ): PredictionHandle {
    const at = this.#runtime.now();
    const result: PredictionTerminalResult = {
      candidate,
      outcome: "rejected",
      acceptedAt: at,
      completedAt: at,
      materialWork: false,
      bytes: 0,
      reason,
    };
    this.#recordHistory(result);
    this.#emit({ type: "rejected", at, candidate, reason });
    return {
      candidate,
      accepted: false,
      deduplicated: false,
      status: "terminal",
      completion: Promise.resolve(result),
      markReused: () => false,
      cancel: () => undefined,
    };
  }

  #drain(): void {
    if (this.#disposed) return;
    this.#queue.sort(
      (left, right) =>
        right.candidate.priority - left.candidate.priority ||
        right.candidate.probability - left.candidate.probability ||
        left.sequence - right.sequence,
    );

    while (this.#running < this.#maxConcurrent && this.#queue.length > 0) {
      const record = this.#queue.shift();
      if (!record || record.status !== "queued") continue;
      if (this.#runtime.now() >= record.deadlineAt) {
        this.#finalize(record, "expired");
        continue;
      }
      this.#start(record);
    }
  }

  #start(record: PredictionRecord): void {
    record.status = "running";
    const startedAt = this.#runtime.now();
    record.startedAt = startedAt;
    record.materialWork = true;
    this.#running += 1;
    this.#emit({
      type: "started",
      at: startedAt,
      candidate: record.candidate,
      materialWork: true,
      bytes: record.bytes,
    });

    let loading: Promise<PredictionWorkResult | void>;
    try {
      loading = Promise.resolve(
        record.loader({
          candidate: record.candidate,
          signal: record.controller.signal,
          startedAt,
        }),
      );
    } catch (error) {
      this.#finalize(record, "failed", undefined, error);
      this.#running -= 1;
      this.#drain();
      return;
    }

    void loading
      .then((result) => this.#loaded(record, result))
      .catch((error: unknown) => {
        if (record.status === "terminal") return;
        this.#finalize(record, "failed", undefined, error);
      })
      .finally(() => {
        this.#running -= 1;
        this.#drain();
      });
  }

  #loaded(record: PredictionRecord, result: PredictionWorkResult | void): void {
    if (record.status === "terminal") return;
    record.loadedAt = this.#runtime.now();
    record.materialWork = result?.materialWork ?? true;
    record.bytes = finiteNonNegative(result?.bytes, record.bytes, "bytes");
    record.status = "waiting_for_reuse";
    this.#emit({
      type: "loaded",
      at: record.loadedAt,
      candidate: record.candidate,
      materialWork: record.materialWork,
      bytes: record.bytes,
    });
    if (record.reusedAt !== undefined) this.#finalize(record, "reused");
  }

  #expire(record: PredictionRecord): void {
    if (record.status === "terminal") return;
    if (record.status === "queued") {
      this.#removeFromQueue(record);
      this.#finalize(record, "expired");
      return;
    }
    if (record.reusedAt !== undefined) return;
    record.controller.abort("prediction horizon expired");
    this.#finalize(record, record.materialWork ? "missed" : "expired");
  }

  #cancel(record: PredictionRecord, reason: PredictionCancellationReason): void {
    if (record.status === "terminal") return;
    if (record.status === "queued") this.#removeFromQueue(record);
    record.controller.abort(reason);
    this.#finalize(record, "cancelled", reason);
  }

  #finalize(
    record: PredictionRecord,
    outcome: PredictionTerminalResult["outcome"],
    reason?: PredictionCancellationReason,
    error?: unknown,
  ): void {
    if (record.status === "terminal") return;
    record.status = "terminal";
    if (record.expiryTask !== null) {
      record.expiryTask.cancel();
      record.expiryTask = null;
    }
    this.#active.delete(record.candidate.key);
    const completedAt = this.#runtime.now();
    const result: PredictionTerminalResult = {
      candidate: record.candidate,
      outcome,
      acceptedAt: record.acceptedAt,
      completedAt,
      materialWork: record.materialWork,
      bytes: record.materialWork ? record.bytes : 0,
      ...(record.startedAt === undefined ? {} : { startedAt: record.startedAt }),
      ...(record.loadedAt === undefined ? {} : { loadedAt: record.loadedAt }),
      ...(record.reusedAt === undefined ? {} : { reusedAt: record.reusedAt }),
      ...(reason === undefined ? {} : { reason }),
      ...(error === undefined ? {} : { error }),
    };
    this.#recordHistory(result);
    record.resolveCompletion(result);
    this.#emit({
      type: eventTypeForOutcome(outcome),
      at: completedAt,
      candidate: record.candidate,
      materialWork: result.materialWork,
      bytes: result.bytes,
      ...(reason === undefined ? {} : { reason }),
      ...(error === undefined ? {} : { error }),
    });
  }

  #removeFromQueue(record: PredictionRecord): void {
    const index = this.#queue.indexOf(record);
    if (index >= 0) this.#queue.splice(index, 1);
  }

  #recordHistory(result: PredictionTerminalResult): void {
    this.#history.push(result);
    if (this.#history.length > this.#maxHistory) {
      this.#history.splice(0, this.#history.length - this.#maxHistory);
    }
  }

  #emit(event: PredictionEvent): void {
    emitSafely(this.#onEvent, event);
    for (const listener of this.#listeners) emitSafely(listener, event);
  }
}

function emitSafely(
  listener: PredictionEventListener | undefined,
  event: PredictionEvent,
) {
  try {
    listener?.(event);
  } catch {
    // Telemetry must not interfere with prediction or committed navigation.
  }
}

function normalizeCandidate(
  candidate: PredictionCandidate,
): Readonly<RequiredPredictionCandidate> {
  if (!candidate.key.trim()) throw new TypeError("candidate.key must not be empty");
  if (!candidate.policy.trim()) {
    throw new TypeError("candidate.policy must not be empty");
  }
  if (!candidate.trigger.trim()) {
    throw new TypeError("candidate.trigger must not be empty");
  }
  if (!candidate.destination.trim()) {
    throw new TypeError("candidate.destination must not be empty");
  }
  const probability = probabilityOption(
    candidate.probability,
    0,
    "candidate.probability",
  );
  const horizonMs = finitePositive(candidate.horizonMs, "candidate.horizonMs");
  const priority = finiteNumber(candidate.priority, 0, "candidate.priority");
  const estimatedBytes = finiteNonNegative(
    candidate.estimatedBytes,
    0,
    "candidate.estimatedBytes",
  );
  const cost = candidate.cost ?? "standard";
  if (cost !== "low" && cost !== "standard" && cost !== "high") {
    throw new TypeError("candidate.cost must be low, standard, or high");
  }
  return Object.freeze({
    ...candidate,
    probability,
    horizonMs,
    priority,
    estimatedBytes,
    cost,
  });
}

function probabilityOption(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved < 0 || resolved > 1) {
    throw new TypeError(`${name} must be between 0 and 1`);
  }
  return resolved;
}

function positiveIntegerOption(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 1) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return resolved;
}

function nonNegativeIntegerOption(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 0) {
    throw new TypeError(`${name} must be a non-negative integer`);
  }
  return resolved;
}

function finitePositive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be greater than 0`);
  }
  return value;
}

function finiteNumber(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved)) throw new TypeError(`${name} must be finite`);
  return resolved;
}

function finiteNonNegative(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved < 0) {
    throw new TypeError(`${name} must be a non-negative finite number`);
  }
  return resolved;
}

function matchesFilter(
  entry: PredictionTerminalResult,
  filter: PredictionQualityFilter,
): boolean {
  return (
    (filter.policy === undefined || entry.candidate.policy === filter.policy) &&
    (filter.trigger === undefined || entry.candidate.trigger === filter.trigger) &&
    (filter.destination === undefined ||
      entry.candidate.destination === filter.destination) &&
    (filter.cost === undefined || entry.candidate.cost === filter.cost)
  );
}

function eventTypeForOutcome(
  outcome: PredictionTerminalResult["outcome"],
): "reused" | "missed" | "failed" | "cancelled" | "expired" | "rejected" {
  return outcome;
}
