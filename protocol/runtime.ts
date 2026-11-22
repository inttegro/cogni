import type {
  BackendCapabilities,
  PredictionBatchRequest,
  PredictionEvent,
  PredictionOutcomeBatch,
  Problem,
} from "./types";

export const COGNI_PROTOCOL_VERSION = "1" as const;
export const JSON_MEDIA_TYPE = "application/json";
export const NDJSON_MEDIA_TYPE = "application/x-ndjson";
export const PROBLEM_MEDIA_TYPE = "application/problem+json";

const RESOURCE_NAME = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const COSTS = new Set(["low", "standard", "high"]);
const REJECTION_REASONS = new Set([
  "below_quality_gate",
  "budget_exhausted",
  "queue_full",
  "unavailable",
  "invalid_parameters",
  "unsupported_representation",
]);
const FAILURE_CODES = new Set(["cancelled", "deadline_exceeded", "backend_error"]);
const OUTCOMES = new Set(["reused", "missed", "expired", "cancelled"]);

export class CogniProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CogniProtocolError";
  }
}

export class PredictionEventSequence {
  readonly #requestId: string;
  readonly #states: Map<string, "pending" | "accepted" | "terminal">;
  #accepted = 0;
  #resolved = 0;
  #rejected = 0;
  #failed = 0;
  #completed = false;

  constructor(request: PredictionBatchRequest) {
    this.#requestId = request.request_id;
    this.#states = new Map(
      request.candidates.map((candidate) => [candidate.prediction_id, "pending"]),
    );
  }

  accept(value: unknown): PredictionEvent {
    if (this.#completed) {
      throw new CogniProtocolError("backend emitted an event after batch.completed");
    }
    if (
      !isRecord(value) ||
      value.protocol_version !== COGNI_PROTOCOL_VERSION ||
      value.request_id !== this.#requestId ||
      typeof value.type !== "string" ||
      !isDateTime(value.at)
    ) {
      throw new CogniProtocolError("backend emitted an invalid prediction event");
    }

    if (value.type === "batch.completed") {
      if ([...this.#states.values()].some((state) => state !== "terminal")) {
        throw new CogniProtocolError(
          "batch.completed arrived before every prediction ended",
        );
      }
      if (
        !isRecord(value.summary) ||
        value.summary.accepted !== this.#accepted ||
        value.summary.resolved !== this.#resolved ||
        value.summary.rejected !== this.#rejected ||
        value.summary.failed !== this.#failed
      ) {
        throw new CogniProtocolError("batch.completed summary is inconsistent");
      }
      this.#completed = true;
      return value as unknown as PredictionEvent;
    }

    if (typeof value.prediction_id !== "string") {
      throw new CogniProtocolError("prediction event is missing prediction_id");
    }
    const state = this.#states.get(value.prediction_id);
    if (!state) {
      throw new CogniProtocolError(
        "backend emitted an event for an unknown prediction",
      );
    }

    switch (value.type) {
      case "prediction.accepted":
        if (state !== "pending") {
          throw new CogniProtocolError("prediction.accepted is out of order");
        }
        if (!isDateTime(value.expires_at)) {
          throw new CogniProtocolError("prediction.accepted is malformed");
        }
        this.#states.set(value.prediction_id, "accepted");
        this.#accepted += 1;
        break;
      case "prediction.rejected":
        if (state !== "pending") {
          throw new CogniProtocolError("prediction.rejected is out of order");
        }
        if (typeof value.reason !== "string" || !REJECTION_REASONS.has(value.reason)) {
          throw new CogniProtocolError("prediction.rejected is malformed");
        }
        this.#states.set(value.prediction_id, "terminal");
        this.#rejected += 1;
        break;
      case "prediction.resolved":
        if (state !== "accepted") {
          throw new CogniProtocolError(`${value.type} requires prediction.accepted`);
        }
        if (!isResolvedResource(value.resource) || !isPredictionWork(value.work)) {
          throw new CogniProtocolError("prediction.resolved is malformed");
        }
        this.#states.set(value.prediction_id, "terminal");
        this.#resolved += 1;
        break;
      case "prediction.failed":
        if (state !== "accepted") {
          throw new CogniProtocolError(`${value.type} requires prediction.accepted`);
        }
        if (
          typeof value.code !== "string" ||
          !FAILURE_CODES.has(value.code) ||
          typeof value.retryable !== "boolean"
        ) {
          throw new CogniProtocolError("prediction.failed is malformed");
        }
        this.#states.set(value.prediction_id, "terminal");
        this.#failed += 1;
        break;
      default:
        throw new CogniProtocolError(`unknown prediction event ${value.type}`);
    }

    return value as unknown as PredictionEvent;
  }

  finish(): void {
    if (!this.#completed) {
      throw new CogniProtocolError("backend ended without batch.completed");
    }
  }
}

export function parsePredictionBatchRequest(value: unknown): PredictionBatchRequest {
  if (
    !isRecord(value) ||
    value.protocol_version !== COGNI_PROTOCOL_VERSION ||
    !isIdentifier(value.request_id) ||
    !Array.isArray(value.candidates) ||
    value.candidates.length === 0 ||
    value.candidates.length > 16
  ) {
    throw new CogniProtocolError("prediction request is invalid");
  }

  const predictionIds = new Set<string>();
  for (const candidate of value.candidates) {
    if (
      !isRecord(candidate) ||
      !isIdentifier(candidate.prediction_id) ||
      typeof candidate.policy !== "string" ||
      candidate.policy.length === 0 ||
      typeof candidate.trigger !== "string" ||
      candidate.trigger.length === 0 ||
      !isProbability(candidate.probability) ||
      !isPositiveInteger(candidate.horizon_ms) ||
      candidate.horizon_ms > 60_000 ||
      typeof candidate.cost !== "string" ||
      !COSTS.has(candidate.cost) ||
      (candidate.priority !== undefined &&
        (typeof candidate.priority !== "number" ||
          !Number.isInteger(candidate.priority) ||
          candidate.priority < -100 ||
          candidate.priority > 100)) ||
      (candidate.estimated_bytes !== undefined &&
        !isNonNegativeInteger(candidate.estimated_bytes)) ||
      !isResourceRequest(candidate.resource)
    ) {
      throw new CogniProtocolError("prediction request contains an invalid candidate");
    }
    if (predictionIds.has(candidate.prediction_id)) {
      throw new CogniProtocolError("prediction_id must be unique within a request");
    }
    predictionIds.add(candidate.prediction_id);
  }

  return value as unknown as PredictionBatchRequest;
}

export function parseOutcomeBatch(value: unknown): PredictionOutcomeBatch {
  if (
    !isRecord(value) ||
    value.protocol_version !== COGNI_PROTOCOL_VERSION ||
    !isIdentifier(value.request_id) ||
    !Array.isArray(value.outcomes) ||
    value.outcomes.length === 0 ||
    value.outcomes.some(
      (outcome) =>
        !isRecord(outcome) ||
        !isIdentifier(outcome.prediction_id) ||
        typeof outcome.outcome !== "string" ||
        !OUTCOMES.has(outcome.outcome) ||
        !isDateTime(outcome.observed_at) ||
        (outcome.lead_time_ms !== undefined &&
          !isNonNegativeInteger(outcome.lead_time_ms)),
    )
  ) {
    throw new CogniProtocolError("outcome batch is invalid");
  }
  return value as unknown as PredictionOutcomeBatch;
}

export function parseBackendCapabilities(value: unknown): BackendCapabilities {
  if (
    !isRecord(value) ||
    value.protocol_version !== COGNI_PROTOCOL_VERSION ||
    !Array.isArray(value.transports) ||
    value.transports.length === 0 ||
    value.transports.some(
      (transport) => transport !== JSON_MEDIA_TYPE && transport !== NDJSON_MEDIA_TYPE,
    ) ||
    !Array.isArray(value.representations) ||
    value.representations.length === 0 ||
    value.representations.some(
      (representation) => representation !== JSON_MEDIA_TYPE,
    ) ||
    !isRecord(value.limits) ||
    !isPositiveInteger(value.limits.max_candidates_per_batch) ||
    !isPositiveInteger(value.limits.max_horizon_ms) ||
    typeof value.outcome_reporting !== "boolean"
  ) {
    throw new CogniProtocolError("backend returned invalid capabilities");
  }
  return value as unknown as BackendCapabilities;
}

export function isProblem(value: unknown): value is Problem {
  return (
    isRecord(value) &&
    typeof value.type === "string" &&
    typeof value.title === "string" &&
    typeof value.status === "number"
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isResourceRequest(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    value.name.length <= 128 &&
    RESOURCE_NAME.test(value.name) &&
    typeof value.cache_key === "string" &&
    value.cache_key.length > 0 &&
    value.cache_key.length <= 512 &&
    (value.parameters === undefined || isRecord(value.parameters))
  );
}

function isResolvedResource(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.cache_key === "string" &&
    value.media_type === JSON_MEDIA_TYPE &&
    "payload" in value &&
    (value.etag === undefined || typeof value.etag === "string") &&
    (value.expires_at === undefined || isDateTime(value.expires_at))
  );
}

function isPredictionWork(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.material_work === "boolean" &&
    isNonNegativeInteger(value.bytes) &&
    isNonNegativeInteger(value.duration_ms)
  );
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

function isProbability(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
  );
}

function isDateTime(value: unknown): value is string {
  return (
    typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value))
  );
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
