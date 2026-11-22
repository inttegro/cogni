import { PredictionCoordinator } from "./coordinator";
import type {
  PredictionCandidate,
  PredictionHandle,
  PredictionLoader,
  PredictionScheduleOptions,
  PredictionScheduledTask,
  PredictionSchedulerOptions,
  PredictionSchedulerRuntime,
  ScheduledPrediction,
  ScheduledPredictionStatus,
} from "./types";

const DEFAULT_IDLE_TIMEOUT_MS = 2_500;

const SYSTEM_RUNTIME: PredictionSchedulerRuntime = {
  now: () => Date.now(),
  schedule(delayMs, task) {
    const timer = setTimeout(task, delayMs);
    return { cancel: () => clearTimeout(timer) };
  },
  scheduleIdle(_timeoutMs, task) {
    const timer = setTimeout(task, 0);
    return { cancel: () => clearTimeout(timer) };
  },
};

interface ScheduledRecord {
  readonly candidate: Readonly<PredictionCandidate>;
  readonly loader: PredictionLoader;
  readonly options: RequiredScheduleOptions;
  readonly sequence: number;
  eligibleAt: number;
  forceAt: number | undefined;
  readonly started: Promise<PredictionHandle | null>;
  readonly resolveStarted: (handle: PredictionHandle | null) => void;
  status: ScheduledPredictionStatus;
  urgent: boolean;
  prediction: PredictionHandle | undefined;
}

interface RequiredScheduleOptions {
  delayMs: number;
  idle: boolean;
  idleTimeoutMs: number;
  maxDeferMs: number | undefined;
  allowDuringForeground: boolean;
}

/**
 * Coordinates prediction admission with host activity and environment state.
 *
 * The host owns the signals: call setForegroundActivity as requests start and
 * settle, and setEnvironmentAllowed when visibility or network policy changes.
 * The scheduler owns defer ceilings, idle starts, direct-intent escalation,
 * priority ordering, and pending-work deduplication.
 */
export class PredictionScheduler {
  readonly #coordinator: PredictionCoordinator;
  readonly #ownsCoordinator: boolean;
  readonly #runtime: PredictionSchedulerRuntime;
  readonly #pending = new Map<string, ScheduledRecord>();
  #foregroundActivity: number;
  #environmentAllowed: boolean;
  #sequence = 0;
  #wakeTask: PredictionScheduledTask | null = null;
  #idleTask: PredictionScheduledTask | null = null;
  #idleRecord: ScheduledRecord | null = null;
  #disposed = false;

  constructor(options: PredictionSchedulerOptions = {}) {
    this.#runtime = options.runtime ?? SYSTEM_RUNTIME;
    this.#coordinator =
      options.coordinator ??
      new PredictionCoordinator({
        ...options.coordinatorOptions,
        runtime: this.#runtime,
      });
    this.#ownsCoordinator = options.coordinator === undefined;
    this.#environmentAllowed = options.environmentAllowed ?? true;
    this.#foregroundActivity = nonNegativeInteger(
      options.foregroundActivity ?? 0,
      "foregroundActivity",
    );
  }

  get coordinator(): PredictionCoordinator {
    return this.#coordinator;
  }

  get foregroundActivity(): number {
    return this.#foregroundActivity;
  }

  get environmentAllowed(): boolean {
    return this.#environmentAllowed;
  }

  schedule(
    candidateInput: PredictionCandidate,
    loader: PredictionLoader,
    scheduleOptions: PredictionScheduleOptions = {},
  ): ScheduledPrediction {
    const existing = this.#pending.get(candidateInput.key);
    if (existing) return this.#handle(existing);

    if (this.#disposed) {
      return cancelledSchedule(candidateInput);
    }

    const options = normalizeScheduleOptions(scheduleOptions);
    const scheduledAt = this.#runtime.now();
    let resolveStarted!: (handle: PredictionHandle | null) => void;
    const started = new Promise<PredictionHandle | null>((resolve) => {
      resolveStarted = resolve;
    });
    const record: ScheduledRecord = {
      candidate: Object.freeze({ ...candidateInput }),
      loader,
      options,
      sequence: this.#sequence++,
      eligibleAt: scheduledAt + options.delayMs,
      forceAt:
        options.maxDeferMs === undefined ? undefined : scheduledAt + options.maxDeferMs,
      started,
      resolveStarted,
      status: "pending",
      urgent: false,
      prediction: undefined,
    };
    this.#pending.set(record.candidate.key, record);
    this.#pump();
    return this.#handle(record);
  }

  setForegroundActivity(count: number): void {
    const previous = this.#foregroundActivity;
    this.#foregroundActivity = nonNegativeInteger(count, "foregroundActivity");
    if (count > 0) this.#cancelIdle();
    if (previous > 0 && count === 0) {
      const now = this.#runtime.now();
      for (const record of this.#pending.values()) {
        if (!record.urgent) record.eligibleAt = now + record.options.delayMs;
      }
    }
    this.#pump();
  }

  setEnvironmentAllowed(allowed: boolean): void {
    const becameAllowed = allowed && !this.#environmentAllowed;
    this.#environmentAllowed = allowed;
    if (!allowed) this.#cancelIdle();
    if (becameAllowed) {
      const now = this.#runtime.now();
      for (const record of this.#pending.values()) {
        if (record.urgent) continue;
        record.eligibleAt = now + record.options.delayMs;
        record.forceAt =
          record.options.maxDeferMs === undefined
            ? undefined
            : now + record.options.maxDeferMs;
      }
    }
    this.#pump();
  }

  cancel(key: string): void {
    const record = this.#pending.get(key);
    if (record) {
      this.#cancelPending(record);
      return;
    }
    this.#coordinator.cancel(key);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#cancelWake();
    this.#cancelIdle();
    for (const record of [...this.#pending.values()]) {
      this.#cancelPending(record);
    }
    if (this.#ownsCoordinator) this.#coordinator.dispose();
  }

  #handle(record: ScheduledRecord): ScheduledPrediction {
    return {
      candidate: record.candidate,
      get status() {
        return record.status;
      },
      started: record.started,
      startNow: () => {
        if (record.status !== "pending") return;
        record.urgent = true;
        this.#cancelIdleFor(record);
        this.#pump();
      },
      cancel: () => {
        if (record.status === "pending") {
          this.#cancelPending(record);
        } else {
          record.prediction?.cancel();
        }
      },
    };
  }

  #pump(): void {
    this.#cancelWake();
    if (this.#disposed || !this.#environmentAllowed) return;

    const now = this.#runtime.now();
    const records = [...this.#pending.values()].sort(compareRecords);
    let nextWakeAt = Number.POSITIVE_INFINITY;

    for (const record of records) {
      if (record.status !== "pending" || this.#idleRecord === record) continue;

      if (!record.urgent && now < record.eligibleAt) {
        nextWakeAt = Math.min(nextWakeAt, record.eligibleAt);
        continue;
      }

      const forced = record.forceAt !== undefined && now >= record.forceAt;
      const blockedByForeground =
        this.#foregroundActivity > 0 &&
        !record.options.allowDuringForeground &&
        !record.urgent &&
        !forced;
      if (blockedByForeground) {
        if (record.forceAt !== undefined) {
          nextWakeAt = Math.min(nextWakeAt, record.forceAt);
        }
        continue;
      }

      if (record.options.idle && !record.urgent && !forced) {
        if (this.#idleTask === null) this.#scheduleIdle(record);
        continue;
      }

      this.#start(record);
    }

    if (Number.isFinite(nextWakeAt)) {
      this.#wakeTask = this.#runtime.schedule(Math.max(0, nextWakeAt - now), () => {
        this.#wakeTask = null;
        this.#pump();
      });
    }
  }

  #scheduleIdle(record: ScheduledRecord): void {
    this.#idleRecord = record;
    this.#idleTask = this.#runtime.scheduleIdle(record.options.idleTimeoutMs, () => {
      this.#idleTask = null;
      this.#idleRecord = null;
      if (
        record.status === "pending" &&
        this.#environmentAllowed &&
        (this.#foregroundActivity === 0 || record.options.allowDuringForeground)
      ) {
        this.#start(record);
      }
      this.#pump();
    });
  }

  #start(record: ScheduledRecord): void {
    if (record.status !== "pending") return;
    this.#cancelIdleFor(record);
    this.#pending.delete(record.candidate.key);
    record.status = "started";
    const prediction = this.#coordinator.predict(record.candidate, record.loader);
    record.prediction = prediction;
    record.resolveStarted(prediction);
  }

  #cancelPending(record: ScheduledRecord): void {
    if (record.status !== "pending") return;
    this.#cancelIdleFor(record);
    this.#pending.delete(record.candidate.key);
    record.status = "cancelled";
    record.resolveStarted(null);
    this.#pump();
  }

  #cancelIdleFor(record: ScheduledRecord): void {
    if (this.#idleRecord === record) this.#cancelIdle();
  }

  #cancelIdle(): void {
    this.#idleTask?.cancel();
    this.#idleTask = null;
    this.#idleRecord = null;
  }

  #cancelWake(): void {
    this.#wakeTask?.cancel();
    this.#wakeTask = null;
  }
}

function compareRecords(left: ScheduledRecord, right: ScheduledRecord): number {
  return (
    Number(right.urgent) - Number(left.urgent) ||
    (right.candidate.priority ?? 0) - (left.candidate.priority ?? 0) ||
    right.candidate.probability - left.candidate.probability ||
    left.sequence - right.sequence
  );
}

function normalizeScheduleOptions(
  options: PredictionScheduleOptions,
): RequiredScheduleOptions {
  return {
    delayMs: nonNegativeFinite(options.delayMs ?? 0, "delayMs"),
    idle: options.idle ?? true,
    idleTimeoutMs: nonNegativeFinite(
      options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
      "idleTimeoutMs",
    ),
    maxDeferMs:
      options.maxDeferMs === undefined
        ? undefined
        : nonNegativeFinite(options.maxDeferMs, "maxDeferMs"),
    allowDuringForeground: options.allowDuringForeground ?? false,
  };
}

function cancelledSchedule(candidate: PredictionCandidate): ScheduledPrediction {
  return {
    candidate: Object.freeze({ ...candidate }),
    status: "cancelled",
    started: Promise.resolve(null),
    startNow: () => undefined,
    cancel: () => undefined,
  };
}

function nonNegativeFinite(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative finite number`);
  }
  return value;
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative integer`);
  }
  return value;
}
