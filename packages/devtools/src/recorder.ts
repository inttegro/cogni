import type {
  PredictionCandidate,
  PredictionEvent,
  PredictionScheduler,
  PredictionSchedulerEvent,
} from "@inttegro/cogni-client";

import { COGNI_DEVTOOLS_PROTOCOL } from "./types";
import type {
  CogniDevtoolsEntry,
  CogniDevtoolsSnapshot,
  CogniDevtoolsStore,
  CogniDevtoolsSummary,
  CogniDevtoolsTrace,
  CogniDevtoolsTraceState,
} from "./types";

export interface CogniDevtoolsRecorderOptions {
  maxEntries?: number;
  maxTraces?: number;
  now?: () => number;
}

interface MutableTrace extends CogniDevtoolsTrace {
  candidate: Readonly<PredictionCandidate>;
}

const TERMINAL_STATES = new Set<CogniDevtoolsTraceState>([
  "reused",
  "missed",
  "failed",
  "cancelled",
  "expired",
  "rejected",
]);

export class CogniDevtoolsRecorder implements CogniDevtoolsStore {
  readonly #scheduler: PredictionScheduler;
  readonly #maxEntries: number;
  readonly #maxTraces: number;
  readonly #now: () => number;
  readonly #entries: CogniDevtoolsEntry[] = [];
  readonly #traces: MutableTrace[] = [];
  readonly #currentTraceByKey = new Map<string, MutableTrace>();
  readonly #attemptsByKey = new Map<string, number>();
  readonly #listeners = new Set<(snapshot: CogniDevtoolsSnapshot) => void>();
  readonly #unsubscribeScheduler: () => void;
  readonly #unsubscribeCoordinator: () => void;
  #sequence = 0;
  #disposed = false;

  constructor(
    scheduler: PredictionScheduler,
    options: CogniDevtoolsRecorderOptions = {},
  ) {
    this.#scheduler = scheduler;
    this.#maxEntries = positiveInteger(options.maxEntries ?? 500, "maxEntries");
    this.#maxTraces = positiveInteger(options.maxTraces ?? 200, "maxTraces");
    this.#now = options.now ?? (() => Date.now());
    this.#unsubscribeScheduler = scheduler.subscribe((event) =>
      this.#recordScheduler(event),
    );
    this.#unsubscribeCoordinator = scheduler.coordinator.subscribe((event) =>
      this.#recordCoordinator(event),
    );
  }

  snapshot(): CogniDevtoolsSnapshot {
    return {
      protocol: COGNI_DEVTOOLS_PROTOCOL,
      generatedAt: this.#now(),
      environmentAllowed: this.#scheduler.environmentAllowed,
      foregroundActivity: this.#scheduler.foregroundActivity,
      entries: this.#entries.map((entry) => ({ ...entry })),
      traces: this.#traces.map((trace) => ({ ...trace })),
      summary: summarize(this.#traces),
    };
  }

  subscribe(listener: (snapshot: CogniDevtoolsSnapshot) => void): () => void {
    if (this.#disposed) return () => undefined;
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  clear(): void {
    this.#entries.length = 0;
    this.#traces.length = 0;
    this.#currentTraceByKey.clear();
    this.#attemptsByKey.clear();
    this.#notify();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#unsubscribeScheduler();
    this.#unsubscribeCoordinator();
    this.#listeners.clear();
  }

  #recordScheduler(event: PredictionSchedulerEvent): void {
    this.#appendEntry("scheduler", event);
    if ("candidate" in event) {
      const trace = this.#traceFor(
        event.candidate,
        event.type === "scheduled",
        event.at,
      );
      trace.lastAt = event.at;
      if (event.type === "scheduled") trace.state = "scheduled";
      if (event.type === "schedule_started") {
        trace.state = "accepted";
        trace.startMode = event.mode;
      }
      if (event.type === "schedule_cancelled") {
        trace.state = "cancelled";
        trace.reason = event.reason;
        this.#finish(trace);
      }
    }
    this.#notify();
  }

  #recordCoordinator(event: PredictionEvent): void {
    this.#appendEntry("coordinator", event);
    const trace = this.#traceFor(event.candidate, event.type === "accepted", event.at);
    trace.lastAt = event.at;
    const state = stateForCoordinatorEvent(event.type);
    if (state) trace.state = state;
    if (event.materialWork !== undefined) trace.materialWork = event.materialWork;
    if (event.bytes !== undefined) trace.bytes = event.bytes;
    if (event.reason !== undefined) trace.reason = event.reason;
    if (state && TERMINAL_STATES.has(state)) this.#finish(trace);
    this.#notify();
  }

  #appendEntry(
    source: CogniDevtoolsEntry["source"],
    event: PredictionEvent | PredictionSchedulerEvent,
  ): void {
    const entry: CogniDevtoolsEntry = {
      id: ++this.#sequence,
      source,
      type: event.type,
      at: event.at,
      ...("candidate" in event ? { candidate: event.candidate } : {}),
      details: eventDetails(event),
    };
    this.#entries.push(entry);
    trimFront(this.#entries, this.#maxEntries);
  }

  #traceFor(
    candidate: Readonly<PredictionCandidate>,
    beginAttempt: boolean,
    at: number,
  ): MutableTrace {
    const current = this.#currentTraceByKey.get(candidate.key);
    if (current && (!beginAttempt || !TERMINAL_STATES.has(current.state))) {
      return current;
    }
    if (!current && !beginAttempt) {
      const previous = findLastTrace(this.#traces, candidate.key);
      if (previous) return previous;
    }

    const attempt = (this.#attemptsByKey.get(candidate.key) ?? 0) + 1;
    this.#attemptsByKey.set(candidate.key, attempt);
    const trace: MutableTrace = {
      id: `${candidate.key}:${attempt}`,
      attempt,
      candidate: Object.freeze({ ...candidate }),
      state: "scheduled",
      firstAt: at,
      lastAt: at,
      materialWork: false,
      bytes: candidate.estimatedBytes ?? 0,
    };
    this.#traces.push(trace);
    this.#currentTraceByKey.set(candidate.key, trace);
    if (this.#traces.length > this.#maxTraces) {
      const removed = this.#traces.splice(0, this.#traces.length - this.#maxTraces);
      for (const candidateTrace of removed) {
        if (
          this.#currentTraceByKey.get(candidateTrace.candidate.key) === candidateTrace
        ) {
          this.#currentTraceByKey.delete(candidateTrace.candidate.key);
        }
      }
    }
    return trace;
  }

  #finish(trace: MutableTrace): void {
    if (this.#currentTraceByKey.get(trace.candidate.key) === trace) {
      this.#currentTraceByKey.delete(trace.candidate.key);
    }
  }

  #notify(): void {
    if (this.#disposed || this.#listeners.size === 0) return;
    const snapshot = this.snapshot();
    for (const listener of this.#listeners) {
      try {
        listener(snapshot);
      } catch {
        // Development tooling must never affect predictive work.
      }
    }
  }
}

export class CogniDevtoolsSnapshotStore implements CogniDevtoolsStore {
  readonly #listeners = new Set<(snapshot: CogniDevtoolsSnapshot) => void>();
  #snapshot: CogniDevtoolsSnapshot;

  constructor(snapshot: CogniDevtoolsSnapshot = emptyCogniDevtoolsSnapshot()) {
    this.#snapshot = snapshot;
  }

  snapshot(): CogniDevtoolsSnapshot {
    return this.#snapshot;
  }

  setSnapshot(snapshot: CogniDevtoolsSnapshot): void {
    if (snapshot.protocol !== COGNI_DEVTOOLS_PROTOCOL) return;
    this.#snapshot = snapshot;
    for (const listener of this.#listeners) listener(snapshot);
  }

  subscribe(listener: (snapshot: CogniDevtoolsSnapshot) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}

export function emptyCogniDevtoolsSnapshot(): CogniDevtoolsSnapshot {
  return {
    protocol: COGNI_DEVTOOLS_PROTOCOL,
    generatedAt: Date.now(),
    environmentAllowed: true,
    foregroundActivity: 0,
    entries: [],
    traces: [],
    summary: summarize([]),
  };
}

function stateForCoordinatorEvent(
  type: PredictionEvent["type"],
): CogniDevtoolsTraceState | undefined {
  switch (type) {
    case "accepted":
      return "accepted";
    case "started":
      return "running";
    case "loaded":
      return "waiting_for_reuse";
    case "reused":
    case "missed":
    case "failed":
    case "cancelled":
    case "expired":
    case "rejected":
      return type;
    case "deduplicated":
      return undefined;
  }
}

function eventDetails(
  event: PredictionEvent | PredictionSchedulerEvent,
): Readonly<Record<string, string | number | boolean | null>> {
  const details: Record<string, string | number | boolean | null> = {};
  if ("materialWork" in event && event.materialWork !== undefined) {
    details.materialWork = event.materialWork;
  }
  if ("bytes" in event && event.bytes !== undefined) details.bytes = event.bytes;
  if ("reason" in event && event.reason !== undefined) details.reason = event.reason;
  if ("mode" in event) details.mode = event.mode;
  if (event.type === "scheduled") {
    details.delayMs = event.options.delayMs;
    details.idle = event.options.idle;
    details.eligibleAt = event.eligibleAt;
    if (event.forceAt !== undefined) details.forceAt = event.forceAt;
  }
  if (event.type === "environment_changed") details.allowed = event.allowed;
  if (event.type === "foreground_activity_changed") details.count = event.count;
  if ("error" in event && event.error !== undefined) {
    details.error = errorMessage(event.error);
  }
  if ("candidate" in event && event.candidate.calibration !== undefined) {
    details.baseProbability = event.candidate.calibration.baseProbability;
    details.personalizedProbability =
      event.candidate.calibration.personalizedProbability;
    details.calibrationEvidence = event.candidate.calibration.evidence;
    details.calibrationConfidence = event.candidate.calibration.confidence;
    details.calibrationAdjustment = event.candidate.calibration.adjustment;
  }
  return Object.freeze(details);
}

function summarize(traces: readonly CogniDevtoolsTrace[]): CogniDevtoolsSummary {
  const terminal = traces.filter((trace) => TERMINAL_STATES.has(trace.state));
  const material = terminal.filter((trace) => trace.materialWork);
  const reused = material.filter((trace) => trace.state === "reused");
  const totalBytes = material.reduce((sum, trace) => sum + trace.bytes, 0);
  const reusedBytes = reused.reduce((sum, trace) => sum + trace.bytes, 0);
  const expectedReuseRate =
    material.length === 0
      ? null
      : material.reduce((sum, trace) => sum + trace.candidate.probability, 0) /
        material.length;
  const reuseRate = material.length === 0 ? null : reused.length / material.length;

  return {
    active: traces.length - terminal.length,
    outcomes: terminal.length,
    materialOutcomes: material.length,
    reused: reused.length,
    missed: terminal.filter((trace) => trace.state === "missed").length,
    failed: terminal.filter((trace) => trace.state === "failed").length,
    rejected: terminal.filter((trace) => trace.state === "rejected").length,
    totalBytes,
    reusedBytes,
    wastedBytes: Math.max(0, totalBytes - reusedBytes),
    reuseRate,
    byteReuseRate: totalBytes === 0 ? null : reusedBytes / totalBytes,
    expectedReuseRate,
    calibrationGap:
      reuseRate === null || expectedReuseRate === null
        ? null
        : reuseRate - expectedReuseRate,
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function trimFront<Value>(values: Value[], maximum: number): void {
  if (values.length > maximum) values.splice(0, values.length - maximum);
}

function findLastTrace(
  traces: readonly MutableTrace[],
  key: string,
): MutableTrace | undefined {
  for (let index = traces.length - 1; index >= 0; index -= 1) {
    const trace = traces[index];
    if (trace?.candidate.key === key) return trace;
  }
  return undefined;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return value;
}
