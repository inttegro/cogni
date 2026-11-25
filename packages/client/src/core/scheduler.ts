import { PredictionCoordinator } from "./coordinator";
import type {
  PredictionCandidate,
  PredictionCalibrationController,
  PredictionHandle,
  PredictionLoader,
  PredictionScheduleOptions,
  PredictionSchedulerCancellationReason,
  PredictionSchedulerEvent,
  PredictionSchedulerEventListener,
  PredictionSchedulerStartMode,
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
  candidate: Readonly<PredictionCandidate>;
  readonly loader: PredictionLoader;
  readonly options: RequiredScheduleOptions;
  readonly sequence: number;
  eligibleAt: number;
  forceAt: number | undefined;
  readonly started: Promise<PredictionHandle | null>;
  readonly resolveStarted: (handle: PredictionHandle | null) => void;
  status: ScheduledPredictionStatus;
  starting: boolean;
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
  readonly #calibration: PredictionCalibrationController | undefined;
  readonly #onEvent: PredictionSchedulerEventListener | undefined;
  readonly #listeners = new Set<PredictionSchedulerEventListener>();
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
    this.#calibration = options.calibration;
    this.#onEvent = options.onEvent;
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
    if (existing) {
      this.#emit({
        type: "schedule_deduplicated",
        at: this.#runtime.now(),
        candidate: existing.candidate,
      });
      return this.#handle(existing);
    }

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
      starting: false,
      urgent: false,
      prediction: undefined,
    };
    this.#pending.set(record.candidate.key, record);
    this.#emit({
      type: "scheduled",
      at: scheduledAt,
      candidate: record.candidate,
      options: record.options,
      eligibleAt: record.eligibleAt,
      ...(record.forceAt === undefined ? {} : { forceAt: record.forceAt }),
    });
    this.#pump();
    return this.#handle(record);
  }

  setForegroundActivity(count: number): void {
    const previous = this.#foregroundActivity;
    this.#foregroundActivity = nonNegativeInteger(count, "foregroundActivity");
    this.#emit({
      type: "foreground_activity_changed",
      at: this.#runtime.now(),
      count: this.#foregroundActivity,
    });
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
    this.#emit({
      type: "environment_changed",
      at: this.#runtime.now(),
      allowed,
    });
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
      this.#cancelPending(record, "cancelled_by_host");
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
      this.#cancelPending(record, "scheduler_disposed");
    }
    if (this.#ownsCoordinator) this.#coordinator.dispose();
  }

  subscribe(listener: PredictionSchedulerEventListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #handle(record: ScheduledRecord): ScheduledPrediction {
    return {
      get candidate() {
        return record.candidate;
      },
      get status() {
        return record.status;
      },
      started: record.started,
      startNow: () => {
        if (record.status !== "pending") return;
        record.urgent = true;
        this.#emit({
          type: "schedule_escalated",
          at: this.#runtime.now(),
          candidate: record.candidate,
        });
        this.#cancelIdleFor(record);
        this.#pump();
      },
      cancel: () => {
        if (record.status === "pending") {
          this.#cancelPending(record, "cancelled_by_host");
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
      if (
        record.status !== "pending" ||
        record.starting ||
        this.#idleRecord === record
      ) {
        continue;
      }

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

      this.#start(
        record,
        record.urgent ? "direct" : forced ? "defer_limit" : "eligible",
      );
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
        this.#start(record, "idle");
      }
      this.#pump();
    });
  }

  #start(record: ScheduledRecord, mode: PredictionSchedulerStartMode): void {
    if (record.status !== "pending" || record.starting) return;
    this.#cancelIdleFor(record);
    if (this.#calibration === undefined) {
      this.#finishStart(record, mode, record.candidate);
      return;
    }

    record.starting = true;
    void this.#calibration
      .calibrate(record.candidate)
      .then((candidate) => {
        const calibrated =
          candidate.key === record.candidate.key
            ? Object.freeze({ ...candidate })
            : record.candidate;
        this.#finishStart(record, mode, calibrated);
      })
      .catch(() => this.#finishStart(record, mode, record.candidate));
  }

  #finishStart(
    record: ScheduledRecord,
    mode: PredictionSchedulerStartMode,
    candidate: Readonly<PredictionCandidate>,
  ): void {
    record.starting = false;
    if (record.status !== "pending") return;
    record.candidate = candidate;
    this.#pending.delete(record.candidate.key);
    record.status = "started";
    this.#emit({
      type: "schedule_started",
      at: this.#runtime.now(),
      candidate: record.candidate,
      mode,
    });
    const prediction = this.#coordinator.predict(record.candidate, record.loader);
    record.prediction = prediction;
    record.resolveStarted(prediction);
    if (this.#calibration !== undefined) {
      void prediction.completion
        .then((result) => this.#calibration?.observe(result))
        .catch(() => undefined);
    }
  }

  #cancelPending(
    record: ScheduledRecord,
    reason: PredictionSchedulerCancellationReason,
  ): void {
    if (record.status !== "pending") return;
    record.starting = false;
    this.#cancelIdleFor(record);
    this.#pending.delete(record.candidate.key);
    record.status = "cancelled";
    this.#emit({
      type: "schedule_cancelled",
      at: this.#runtime.now(),
      candidate: record.candidate,
      reason,
    });
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

  #emit(event: PredictionSchedulerEvent): void {
    emitSafely(this.#onEvent, event);
    for (const listener of this.#listeners) emitSafely(listener, event);
  }
}

function emitSafely(
  listener: PredictionSchedulerEventListener | undefined,
  event: PredictionSchedulerEvent,
): void {
  try {
    listener?.(event);
  } catch {
    // Development tooling and telemetry must never interfere with scheduling.
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
