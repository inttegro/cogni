import type {
  BackendCapabilities,
  PredictionBatchRequest,
  PredictionEvent,
  PredictionOutcomeBatch,
  Problem,
} from "./types";

const PROTOCOL_VERSION = "1";
const JSON_MEDIA_TYPE = "application/json";
const NDJSON_MEDIA_TYPE = "application/x-ndjson";
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

export interface CogniBackendClientOptions {
  /** Host-owned locations for each protocol operation. */
  routes: CogniBackendRoutes;
  /** Host-supplied fetch implementation, useful for SSR and tests. */
  fetch?: typeof fetch;
  /** Additional host headers. Credentials should normally use host auth. */
  headers?: HeadersInit;
  /** Defaults to same-origin so the host application's session is preserved. */
  credentials?: RequestCredentials;
}

export interface CogniBackendRoutes {
  readonly capabilities: string;
  readonly predictions: string;
  readonly outcomes: string;
}

export interface ExecutePredictionsOptions {
  signal?: AbortSignal;
  transport?: "json" | "ndjson";
  /** Receives each validated event immediately, including streamed events. */
  onEvent?: (event: PredictionEvent) => void | Promise<void>;
}

export interface CogniBackendClient {
  capabilities(signal?: AbortSignal): Promise<BackendCapabilities>;
  executePredictions(
    request: PredictionBatchRequest,
    options?: ExecutePredictionsOptions,
  ): Promise<readonly PredictionEvent[]>;
  reportOutcomes(outcomes: PredictionOutcomeBatch, signal?: AbortSignal): Promise<void>;
}

export class CogniProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CogniProtocolError";
  }
}

export class CogniBackendError extends Error {
  readonly status: number;
  readonly problem: Problem | undefined;

  constructor(status: number, problem?: Problem) {
    super(problem?.detail ?? problem?.title ?? `Cogni backend returned HTTP ${status}`);
    this.name = "CogniBackendError";
    this.status = status;
    this.problem = problem;
  }
}

export function createCogniBackendClient(
  options: CogniBackendClientOptions,
): CogniBackendClient {
  if (!isBackendRoutes(options?.routes)) {
    throw new TypeError(
      "routes.capabilities, routes.predictions, and routes.outcomes are required",
    );
  }
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  if (!fetchImplementation) {
    throw new TypeError("a fetch implementation is required");
  }

  const credentials = options.credentials ?? "same-origin";

  async function request(
    route: string,
    init: RequestInit,
    accept: string,
  ): Promise<Response> {
    const headers = new Headers(options.headers);
    headers.set("accept", accept);
    if (init.body !== undefined) headers.set("content-type", JSON_MEDIA_TYPE);

    const response = await fetchImplementation(route, {
      ...init,
      cache: "no-store",
      credentials,
      headers,
    });
    if (!response.ok) throw await backendError(response);
    return response;
  }

  return {
    async capabilities(signal) {
      const response = await request(
        options.routes.capabilities,
        { method: "POST", signal: signal ?? null },
        JSON_MEDIA_TYPE,
      );
      const value: unknown = await response.json();
      if (!isBackendCapabilities(value)) {
        throw new CogniProtocolError("backend returned invalid capabilities");
      }
      return value;
    },

    async executePredictions(requestBody, executionOptions = {}) {
      validatePredictionRequest(requestBody);
      const transport = executionOptions.transport ?? "ndjson";
      const response = await request(
        options.routes.predictions,
        {
          method: "POST",
          body: JSON.stringify(requestBody),
          signal: executionOptions.signal ?? null,
        },
        transport === "ndjson" ? NDJSON_MEDIA_TYPE : JSON_MEDIA_TYPE,
      );
      const contentType = response.headers.get("content-type")?.split(";", 1)[0];
      const sequence = new PredictionEventSequence(requestBody);
      const events: PredictionEvent[] = [];

      async function receive(value: unknown) {
        const event = sequence.accept(value);
        events.push(event);
        await executionOptions.onEvent?.(event);
      }

      if (contentType === NDJSON_MEDIA_TYPE) {
        await readNdjson(response, receive);
      } else if (contentType === JSON_MEDIA_TYPE) {
        const value: unknown = await response.json();
        if (
          !isRecord(value) ||
          value.protocol_version !== PROTOCOL_VERSION ||
          value.request_id !== requestBody.request_id ||
          !Array.isArray(value.events)
        ) {
          throw new CogniProtocolError("backend returned an invalid JSON envelope");
        }
        for (const event of value.events) await receive(event);
      } else {
        throw new CogniProtocolError(
          `backend returned unsupported content type ${JSON.stringify(contentType)}`,
        );
      }

      sequence.finish();
      return events;
    },

    async reportOutcomes(outcomes, signal) {
      validateOutcomeBatch(outcomes);
      const response = await request(
        options.routes.outcomes,
        {
          method: "POST",
          body: JSON.stringify(outcomes),
          signal: signal ?? null,
        },
        JSON_MEDIA_TYPE,
      );
      if (response.status !== 204) {
        throw new CogniProtocolError("outcome endpoint must return HTTP 204");
      }
    },
  };
}

class PredictionEventSequence {
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
      value.protocol_version !== PROTOCOL_VERSION ||
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
      case "prediction.resolved": {
        if (state !== "accepted") {
          throw new CogniProtocolError(`${value.type} requires prediction.accepted`);
        }
        if (!isResolvedResource(value.resource) || !isPredictionWork(value.work)) {
          throw new CogniProtocolError("prediction.resolved is malformed");
        }
        this.#states.set(value.prediction_id, "terminal");
        this.#resolved += 1;
        break;
      }
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

function validatePredictionRequest(request: PredictionBatchRequest): void {
  if (
    request.protocol_version !== PROTOCOL_VERSION ||
    !request.request_id ||
    request.candidates.length === 0 ||
    request.candidates.length > 16
  ) {
    throw new CogniProtocolError("prediction request is invalid");
  }
  const predictionIds = new Set(
    request.candidates.map(({ prediction_id }) => prediction_id),
  );
  if (predictionIds.size !== request.candidates.length) {
    throw new CogniProtocolError("prediction_id must be unique within a request");
  }
  for (const candidate of request.candidates) {
    if (
      !candidate.prediction_id ||
      !candidate.policy ||
      !candidate.trigger ||
      !Number.isFinite(candidate.probability) ||
      candidate.probability < 0 ||
      candidate.probability > 1 ||
      !isPositiveInteger(candidate.horizon_ms) ||
      candidate.horizon_ms > 60_000 ||
      !COSTS.has(candidate.cost) ||
      !RESOURCE_NAME.test(candidate.resource.name) ||
      !candidate.resource.cache_key
    ) {
      throw new CogniProtocolError("prediction request contains an invalid candidate");
    }
  }
}

function validateOutcomeBatch(outcomes: PredictionOutcomeBatch): void {
  if (
    outcomes.protocol_version !== PROTOCOL_VERSION ||
    !outcomes.request_id ||
    outcomes.outcomes.length === 0 ||
    outcomes.outcomes.some(
      (outcome) =>
        !outcome.prediction_id ||
        !OUTCOMES.has(outcome.outcome) ||
        !isDateTime(outcome.observed_at) ||
        (outcome.lead_time_ms !== undefined &&
          !isNonNegativeInteger(outcome.lead_time_ms)),
    )
  ) {
    throw new CogniProtocolError("outcome batch is invalid");
  }
}

async function readNdjson(
  response: Response,
  receive: (value: unknown) => Promise<void>,
): Promise<void> {
  if (!response.body) throw new CogniProtocolError("NDJSON response has no body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });

    let lineBreak = buffer.indexOf("\n");
    while (lineBreak >= 0) {
      const line = buffer.slice(0, lineBreak).replace(/\r$/, "");
      buffer = buffer.slice(lineBreak + 1);
      if (!line) throw new CogniProtocolError("NDJSON response contains an empty line");
      await receive(parseJson(line));
      lineBreak = buffer.indexOf("\n");
    }

    if (done) break;
  }

  if (buffer) await receive(parseJson(buffer));
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new CogniProtocolError("backend returned invalid JSON");
  }
}

async function backendError(response: Response): Promise<CogniBackendError> {
  const contentType = response.headers.get("content-type")?.split(";", 1)[0];
  if (contentType !== "application/problem+json") {
    return new CogniBackendError(response.status);
  }
  const value: unknown = await response.json().catch(() => undefined);
  return new CogniBackendError(
    response.status,
    isRecord(value) &&
      typeof value.type === "string" &&
      typeof value.title === "string" &&
      typeof value.status === "number"
      ? (value as Problem)
      : undefined,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBackendRoutes(value: unknown): value is CogniBackendRoutes {
  return (
    isRecord(value) &&
    typeof value.capabilities === "string" &&
    value.capabilities.length > 0 &&
    typeof value.predictions === "string" &&
    value.predictions.length > 0 &&
    typeof value.outcomes === "string" &&
    value.outcomes.length > 0
  );
}

function isBackendCapabilities(value: unknown): value is BackendCapabilities {
  return (
    isRecord(value) &&
    value.protocol_version === PROTOCOL_VERSION &&
    Array.isArray(value.transports) &&
    value.transports.length > 0 &&
    value.transports.every(
      (transport) => transport === JSON_MEDIA_TYPE || transport === NDJSON_MEDIA_TYPE,
    ) &&
    Array.isArray(value.representations) &&
    value.representations.length > 0 &&
    value.representations.every(
      (representation) => representation === JSON_MEDIA_TYPE,
    ) &&
    isRecord(value.limits) &&
    isPositiveInteger(value.limits.max_candidates_per_batch) &&
    isPositiveInteger(value.limits.max_horizon_ms) &&
    typeof value.outcome_reporting === "boolean"
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
