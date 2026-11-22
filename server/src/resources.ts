import { JSON_MEDIA_TYPE, parseBackendCapabilities } from "../../protocol/runtime";
import type {
  BackendCapabilities,
  PredictionBatchRequest,
  PredictionCandidateRequest,
  PredictionEvent,
  PredictionFailureCode,
  PredictionOutcomeBatch,
  PredictionRejectionReason,
} from "../../protocol/types";

const RESOURCE_NAME = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const DEFAULT_MINIMUM_PROBABILITY = 0.8;
const DEFAULT_HIGH_COST_MINIMUM_PROBABILITY = 0.9;
const DEFAULT_MAX_CONCURRENT = 4;

type Awaitable<Value> = Value | Promise<Value>;

export interface PredictionResourceResult {
  readonly payload: unknown;
  readonly etag?: string;
  readonly expiresAt?: string;
  readonly bytes?: number;
  readonly materialWork?: boolean;
}

export interface PredictionResourceInput<Context, Parameters> {
  readonly context: Context;
  readonly request: Request;
  readonly batch: PredictionBatchRequest;
  readonly candidate: PredictionCandidateRequest;
  readonly cacheKey: string;
  readonly parameters: Parameters;
  readonly signal: AbortSignal;
}

export interface PredictionResourceDefinition<
  Context,
  Parameters extends Readonly<Record<string, unknown>> = Readonly<
    Record<string, unknown>
  >,
> {
  /** Runs before prediction.accepted so invalid input can be rejected cleanly. */
  readonly validate?: (parameters: Readonly<Record<string, unknown>>) => Parameters;
  readonly resolve: (
    input: PredictionResourceInput<Context, Parameters>,
  ) => Awaitable<PredictionResourceResult>;
}

export class PredictionResourceRegistry<Context> {
  readonly #definitions = new Map<string, PredictionResourceDefinition<Context>>();

  register<Parameters extends Readonly<Record<string, unknown>>>(
    name: string,
    definition: PredictionResourceDefinition<Context, Parameters>,
  ): this {
    if (!RESOURCE_NAME.test(name) || name.length > 128) {
      throw new TypeError("resource name must use the Cogni resource-name grammar");
    }
    if (!definition || typeof definition.resolve !== "function") {
      throw new TypeError("resource definition must provide resolve");
    }
    if (this.#definitions.has(name)) {
      throw new TypeError(`resource ${name} is already registered`);
    }
    this.#definitions.set(name, definition as PredictionResourceDefinition<Context>);
    return this;
  }

  has(name: string): boolean {
    return this.#definitions.has(name);
  }

  definition(name: string): PredictionResourceDefinition<Context> | undefined {
    return this.#definitions.get(name);
  }
}

export class CogniResourceRejection extends Error {
  readonly reason: PredictionRejectionReason;

  constructor(reason: PredictionRejectionReason, message: string = reason) {
    super(message);
    this.name = "CogniResourceRejection";
    this.reason = reason;
  }
}

export class CogniResourceFailure extends Error {
  readonly code: PredictionFailureCode;
  readonly retryable: boolean;

  constructor(
    code: PredictionFailureCode,
    options: { readonly retryable?: boolean; readonly message?: string } = {},
  ) {
    super(options.message ?? code);
    this.name = "CogniResourceFailure";
    this.code = code;
    this.retryable = options.retryable ?? false;
  }
}

export interface PredictionExecutorInput<Context> {
  readonly context: Context;
  readonly request: Request;
  readonly batch: PredictionBatchRequest;
  readonly signal: AbortSignal;
}

export interface PredictionExecutorOptions<Context> {
  readonly registry: PredictionResourceRegistry<Context>;
  readonly capabilities: BackendCapabilities;
  readonly minimumProbability?: number;
  readonly highCostMinimumProbability?: number;
  readonly maxConcurrent?: number;
  readonly now?: () => number;
}

export interface PredictionExecutor<Context> {
  execute(input: PredictionExecutorInput<Context>): AsyncIterable<PredictionEvent>;
}

interface PreparedCandidate<Context> {
  readonly candidate: PredictionCandidateRequest;
  readonly definition: PredictionResourceDefinition<Context>;
  readonly parameters: Readonly<Record<string, unknown>>;
}

interface CandidateCompletion {
  readonly token: symbol;
  readonly event: PredictionEvent;
}

/**
 * Creates the portable server policy engine used behind Cogni's wire contract.
 * It admits only registered read-only resources, applies confidence and batch
 * budgets, and streams independent candidates as soon as each one settles.
 */
export function createPredictionExecutor<Context>(
  options: PredictionExecutorOptions<Context>,
): PredictionExecutor<Context> {
  const capabilities = parseBackendCapabilities(options.capabilities);
  const minimumProbability = probability(
    options.minimumProbability ?? DEFAULT_MINIMUM_PROBABILITY,
    "minimumProbability",
  );
  const highCostMinimumProbability = probability(
    options.highCostMinimumProbability ??
      Math.max(DEFAULT_HIGH_COST_MINIMUM_PROBABILITY, minimumProbability),
    "highCostMinimumProbability",
  );
  if (highCostMinimumProbability < minimumProbability) {
    throw new TypeError(
      "highCostMinimumProbability must be at least minimumProbability",
    );
  }
  const maxConcurrent = positiveInteger(
    options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT,
    "maxConcurrent",
  );
  const now = options.now ?? Date.now;

  return {
    async *execute(input) {
      const ranked = input.batch.candidates
        .map((candidate, index) => ({ candidate, index }))
        .sort(
          (left, right) =>
            (right.candidate.priority ?? 0) - (left.candidate.priority ?? 0) ||
            right.candidate.probability - left.candidate.probability ||
            left.index - right.index,
        );
      const prepared: PreparedCandidate<Context>[] = [];
      let accepted = 0;
      let resolved = 0;
      let rejected = 0;
      let failed = 0;

      for (const { candidate } of ranked) {
        const rejection = prepareCandidate(
          candidate,
          prepared.length,
          options.registry,
          capabilities,
          minimumProbability,
          highCostMinimumProbability,
        );
        if ("reason" in rejection) {
          rejected += 1;
          yield rejectedEvent(input.batch.request_id, candidate, rejection.reason, now);
        } else {
          prepared.push(rejection);
        }
      }

      const running = new Map<symbol, Promise<CandidateCompletion>>();
      let next = 0;
      while (next < prepared.length || running.size > 0) {
        while (next < prepared.length && running.size < maxConcurrent) {
          const candidate = prepared[next++];
          if (!candidate) break;
          accepted += 1;
          yield acceptedEvent(input.batch.request_id, candidate.candidate, now);
          const token = Symbol(candidate.candidate.prediction_id);
          running.set(
            token,
            executeCandidate(candidate, input, now).then((event) => ({
              token,
              event,
            })),
          );
        }

        if (running.size === 0) continue;
        const completion = await Promise.race(running.values());
        running.delete(completion.token);
        if (completion.event.type === "prediction.resolved") resolved += 1;
        else failed += 1;
        yield completion.event;
      }

      yield {
        protocol_version: "1",
        request_id: input.batch.request_id,
        type: "batch.completed",
        at: iso(now()),
        summary: { accepted, resolved, rejected, failed },
      };
    },
  };
}

function prepareCandidate<Context>(
  candidate: PredictionCandidateRequest,
  admittedCount: number,
  registry: PredictionResourceRegistry<Context>,
  capabilities: BackendCapabilities,
  minimumProbability: number,
  highCostMinimumProbability: number,
): PreparedCandidate<Context> | { readonly reason: PredictionRejectionReason } {
  const gate =
    candidate.cost === "high" ? highCostMinimumProbability : minimumProbability;
  if (candidate.probability < gate) return { reason: "below_quality_gate" };
  if (
    admittedCount >= capabilities.limits.max_candidates_per_batch ||
    candidate.horizon_ms > capabilities.limits.max_horizon_ms
  ) {
    return { reason: "budget_exhausted" };
  }

  const definition = registry.definition(candidate.resource.name);
  if (!definition) return { reason: "unavailable" };
  try {
    const parameters = definition.validate
      ? definition.validate(candidate.resource.parameters ?? {})
      : (candidate.resource.parameters ?? {});
    return { candidate, definition, parameters };
  } catch (error) {
    if (error instanceof CogniResourceRejection) return { reason: error.reason };
    return { reason: "invalid_parameters" };
  }
}

async function executeCandidate<Context>(
  prepared: PreparedCandidate<Context>,
  input: PredictionExecutorInput<Context>,
  now: () => number,
): Promise<PredictionEvent> {
  const startedAt = now();
  const deadlineAt = startedAt + prepared.candidate.horizon_ms;
  const controller = new AbortController();
  let abortCode: PredictionFailureCode | undefined;
  let rejectCancellation: ((reason: CogniResourceFailure) => void) | undefined;
  const cancelFromRequest = () => {
    abortCode = "cancelled";
    controller.abort(input.signal.reason);
    rejectCancellation?.(new CogniResourceFailure("cancelled"));
  };

  let deadline: ReturnType<typeof setTimeout> | undefined;
  const deadlineFailure = new Promise<never>((_resolve, reject) => {
    deadline = setTimeout(
      () => {
        abortCode = "deadline_exceeded";
        controller.abort("prediction deadline exceeded");
        reject(new CogniResourceFailure("deadline_exceeded"));
      },
      Math.max(0, deadlineAt - now()),
    );
  });
  const requestCancellation = new Promise<never>((_resolve, reject) => {
    rejectCancellation = reject;
  });
  if (input.signal.aborted) cancelFromRequest();
  else input.signal.addEventListener("abort", cancelFromRequest, { once: true });

  try {
    const work = Promise.resolve().then(() => {
      if (controller.signal.aborted) {
        throw new CogniResourceFailure(abortCode ?? "cancelled");
      }
      return prepared.definition.resolve({
        context: input.context,
        request: input.request,
        batch: input.batch,
        candidate: prepared.candidate,
        cacheKey: prepared.candidate.resource.cache_key,
        parameters: prepared.parameters,
        signal: controller.signal,
      });
    });
    const result = normalizeResourceResult(
      await Promise.race([work, deadlineFailure, requestCancellation]),
    );
    const completedAt = now();
    return {
      protocol_version: "1",
      request_id: input.batch.request_id,
      type: "prediction.resolved",
      prediction_id: prepared.candidate.prediction_id,
      at: iso(completedAt),
      resource: {
        name: prepared.candidate.resource.name,
        cache_key: prepared.candidate.resource.cache_key,
        media_type: JSON_MEDIA_TYPE,
        payload: result.payload,
        ...(result.etag === undefined ? {} : { etag: result.etag }),
        ...(result.expiresAt === undefined
          ? {}
          : { expires_at: validDateTime(result.expiresAt, "expiresAt") }),
      },
      work: {
        material_work: result.materialWork ?? true,
        bytes: result.bytes ?? jsonBytes(result.payload),
        duration_ms: Math.max(0, Math.round(completedAt - startedAt)),
      },
    };
  } catch (error) {
    const failure = failureFrom(error, abortCode);
    return {
      protocol_version: "1",
      request_id: input.batch.request_id,
      type: "prediction.failed",
      prediction_id: prepared.candidate.prediction_id,
      at: iso(now()),
      code: failure.code,
      retryable: failure.retryable,
    };
  } finally {
    if (deadline !== undefined) clearTimeout(deadline);
    input.signal.removeEventListener("abort", cancelFromRequest);
  }
}

function acceptedEvent(
  requestId: string,
  candidate: PredictionCandidateRequest,
  now: () => number,
): PredictionEvent {
  const at = now();
  return {
    protocol_version: "1",
    request_id: requestId,
    type: "prediction.accepted",
    prediction_id: candidate.prediction_id,
    at: iso(at),
    expires_at: iso(at + candidate.horizon_ms),
  };
}

function rejectedEvent(
  requestId: string,
  candidate: PredictionCandidateRequest,
  reason: PredictionRejectionReason,
  now: () => number,
): PredictionEvent {
  return {
    protocol_version: "1",
    request_id: requestId,
    type: "prediction.rejected",
    prediction_id: candidate.prediction_id,
    at: iso(now()),
    reason,
  };
}

function failureFrom(
  error: unknown,
  abortCode: PredictionFailureCode | undefined,
): CogniResourceFailure {
  if (error instanceof CogniResourceFailure) return error;
  if (abortCode) return new CogniResourceFailure(abortCode);
  return new CogniResourceFailure("backend_error");
}

function iso(value: number): string {
  return new Date(value).toISOString();
}

function validDateTime(value: string, name: string): string {
  if (Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${name} must be an RFC 3339 date-time`);
  }
  return value;
}

function jsonBytes(value: unknown): number {
  const json = JSON.stringify(value);
  return new TextEncoder().encode(json ?? "null").byteLength;
}

function normalizeResourceResult(value: unknown): PredictionResourceResult {
  if (typeof value !== "object" || value === null || !("payload" in value)) {
    throw new TypeError("resource resolver must return a payload");
  }
  const result = value as Record<string, unknown>;
  if (
    (result.etag !== undefined && typeof result.etag !== "string") ||
    (result.expiresAt !== undefined && typeof result.expiresAt !== "string") ||
    (result.bytes !== undefined &&
      (typeof result.bytes !== "number" ||
        !Number.isInteger(result.bytes) ||
        result.bytes < 0)) ||
    (result.materialWork !== undefined && typeof result.materialWork !== "boolean")
  ) {
    throw new TypeError("resource resolver returned invalid metadata");
  }
  return value as PredictionResourceResult;
}

function probability(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError(`${name} must be between 0 and 1`);
  }
  return value;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return value;
}

export interface CogniResourceServerOptions<Context> {
  readonly registry: PredictionResourceRegistry<Context>;
  readonly capabilities: BackendCapabilities;
  readonly outcomes?: (input: {
    readonly context: Context;
    readonly request: Request;
    readonly batch: PredictionOutcomeBatch;
  }) => Awaitable<void>;
  readonly executor?: Omit<
    PredictionExecutorOptions<Context>,
    "registry" | "capabilities"
  >;
}
