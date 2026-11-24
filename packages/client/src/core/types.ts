export type PredictionCost = "low" | "standard" | "high";

export interface PredictionCandidate {
  /** Stable identity for deduplication and later reuse attribution. */
  key: string;
  /** Policy that produced the candidate. */
  policy: string;
  /** Signal that produced the candidate, such as idle, hover, or focus. */
  trigger: string;
  /** Human-readable destination or resource name for telemetry. */
  destination: string;
  /** Calibrated probability of reuse, from 0 through 1. */
  probability: number;
  /** Maximum time from acceptance to reuse. */
  horizonMs: number;
  /** Relative cost used to select the minimum confidence gate. */
  cost?: PredictionCost;
  /** Higher values start first when work is queued. */
  priority?: number;
  /** Expected transfer size, used until actual work reports its size. */
  estimatedBytes?: number;
}

export interface PredictionWorkResult {
  /** Actual bytes transferred by predictive work when known. */
  bytes?: number;
  /** False when the host cache was already warm and no material work occurred. */
  materialWork?: boolean;
}

export interface PredictionExecution {
  candidate: Readonly<RequiredPredictionCandidate>;
  signal: AbortSignal;
  startedAt: number;
}

export type PredictionLoader = (
  execution: PredictionExecution,
) => Promise<PredictionWorkResult | void>;

export type PredictionStatus = "queued" | "running" | "waiting_for_reuse" | "terminal";

export type PredictionOutcome =
  "reused" | "missed" | "failed" | "cancelled" | "expired" | "rejected";

export type PredictionRejectionReason =
  "below_quality_gate" | "disposed" | "queue_full";

export type PredictionCancellationReason =
  "cancelled_by_host" | "coordinator_disposed" | "superseded_by_committed_action";

export interface PredictionTerminalResult {
  candidate: Readonly<RequiredPredictionCandidate>;
  outcome: PredictionOutcome;
  acceptedAt: number;
  completedAt: number;
  startedAt?: number;
  loadedAt?: number;
  reusedAt?: number;
  materialWork: boolean;
  bytes: number;
  reason?: PredictionRejectionReason | PredictionCancellationReason;
  error?: unknown;
}

export interface PredictionHandle {
  readonly candidate: Readonly<RequiredPredictionCandidate>;
  readonly accepted: boolean;
  readonly deduplicated: boolean;
  readonly status: PredictionStatus;
  readonly completion: Promise<PredictionTerminalResult>;
  markReused(): boolean;
  cancel(): void;
}

export type PredictionEvent =
  | PredictionLifecycleEvent<"accepted">
  | PredictionLifecycleEvent<"started">
  | PredictionLifecycleEvent<"loaded">
  | PredictionLifecycleEvent<"reused">
  | PredictionLifecycleEvent<"missed">
  | PredictionLifecycleEvent<"failed">
  | PredictionLifecycleEvent<"cancelled">
  | PredictionLifecycleEvent<"expired">
  | PredictionLifecycleEvent<"rejected">
  | PredictionLifecycleEvent<"deduplicated">;

export type PredictionEventListener = (event: PredictionEvent) => void;

export interface PredictionLifecycleEvent<
  Type extends
    | "accepted"
    | "started"
    | "loaded"
    | "reused"
    | "missed"
    | "failed"
    | "cancelled"
    | "expired"
    | "rejected"
    | "deduplicated",
> {
  type: Type;
  at: number;
  candidate: Readonly<RequiredPredictionCandidate>;
  materialWork?: boolean;
  bytes?: number;
  reason?: PredictionRejectionReason | PredictionCancellationReason;
  error?: unknown;
}

export interface PredictionQualityFilter {
  policy?: string;
  trigger?: string;
  destination?: string;
  cost?: PredictionCost;
}

export interface PredictionQualitySnapshot {
  outcomes: number;
  materialOutcomes: number;
  reused: number;
  missed: number;
  failed: number;
  cancelledWithWork: number;
  cancelledWithoutWork: number;
  expiredWithoutWork: number;
  rejected: number;
  totalBytes: number;
  reusedBytes: number;
  reuseRate: number | null;
  byteReuseRate: number | null;
}

export interface PredictionScheduledTask {
  cancel(): void;
}

export interface PredictionRuntime {
  now(): number;
  schedule(delayMs: number, task: () => void): PredictionScheduledTask;
}

export interface PredictionSchedulerRuntime extends PredictionRuntime {
  /**
   * Schedules work for an idle opportunity. The timeout is an upper bound for
   * the idle wait, not permission to bypass activity or environment gates.
   */
  scheduleIdle(timeoutMs: number, task: () => void): PredictionScheduledTask;
}

export interface PredictionScheduleOptions {
  /** Delay before this candidate may start. */
  delayMs?: number;
  /** Prefer an idle callback once all other gates allow the work to start. */
  idle?: boolean;
  /** Maximum time to wait for an idle callback. */
  idleTimeoutMs?: number;
  /**
   * Maximum total defer from scheduling before foreground activity is ignored.
   * Environment gates remain authoritative.
   */
  maxDeferMs?: number;
  /** Allows direct user intent to run while foreground requests are active. */
  allowDuringForeground?: boolean;
}

export interface NormalizedPredictionScheduleOptions {
  delayMs: number;
  idle: boolean;
  idleTimeoutMs: number;
  maxDeferMs: number | undefined;
  allowDuringForeground: boolean;
}

export type PredictionSchedulerStartMode =
  "direct" | "eligible" | "idle" | "defer_limit";

export type PredictionSchedulerCancellationReason =
  "cancelled_by_host" | "scheduler_disposed";

export type PredictionSchedulerEvent =
  | {
      type: "scheduled";
      at: number;
      candidate: Readonly<PredictionCandidate>;
      options: Readonly<NormalizedPredictionScheduleOptions>;
      eligibleAt: number;
      forceAt?: number;
    }
  | {
      type: "schedule_deduplicated";
      at: number;
      candidate: Readonly<PredictionCandidate>;
    }
  | {
      type: "schedule_escalated";
      at: number;
      candidate: Readonly<PredictionCandidate>;
    }
  | {
      type: "schedule_started";
      at: number;
      candidate: Readonly<PredictionCandidate>;
      mode: PredictionSchedulerStartMode;
    }
  | {
      type: "schedule_cancelled";
      at: number;
      candidate: Readonly<PredictionCandidate>;
      reason: PredictionSchedulerCancellationReason;
    }
  | {
      type: "environment_changed";
      at: number;
      allowed: boolean;
    }
  | {
      type: "foreground_activity_changed";
      at: number;
      count: number;
    };

export type PredictionSchedulerEventListener = (
  event: PredictionSchedulerEvent,
) => void;

export type ScheduledPredictionStatus = "pending" | "started" | "cancelled";

export interface ScheduledPrediction {
  readonly candidate: Readonly<PredictionCandidate>;
  readonly status: ScheduledPredictionStatus;
  /** Resolves to null when cancelled before the coordinator accepts the work. */
  readonly started: Promise<PredictionHandle | null>;
  /** Bypasses delay, idle, and foreground-activity waits, but not environment gates. */
  startNow(): void;
  cancel(): void;
}

export interface PredictionSchedulerOptions {
  coordinator?: import("./coordinator").PredictionCoordinator;
  coordinatorOptions?: PredictionCoordinatorOptions;
  runtime?: PredictionSchedulerRuntime;
  environmentAllowed?: boolean;
  foregroundActivity?: number;
  onEvent?: PredictionSchedulerEventListener;
}

export interface PredictionCoordinatorOptions {
  minimumProbability?: number;
  highCostMinimumProbability?: number;
  maxConcurrent?: number;
  maxQueued?: number;
  maxHistory?: number;
  runtime?: PredictionRuntime;
  onEvent?: PredictionEventListener;
}

export interface RequiredPredictionCandidate extends Omit<
  PredictionCandidate,
  "cost" | "priority" | "estimatedBytes"
> {
  cost: PredictionCost;
  priority: number;
  estimatedBytes: number;
}
