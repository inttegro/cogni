import {
  CogniProtocolError,
  JSON_MEDIA_TYPE,
  NDJSON_MEDIA_TYPE,
  PROBLEM_MEDIA_TYPE,
  PredictionEventSequence,
  parseBackendCapabilities,
  parseOutcomeBatch,
  parsePredictionBatchRequest,
} from "../../../protocol/runtime";
import type {
  BackendCapabilities,
  PredictionBatchRequest,
  PredictionEvent,
  PredictionOutcomeBatch,
  Problem,
} from "../../../protocol/types";
import { createPredictionExecutor, type CogniResourceServerOptions } from "./resources";

export {
  CogniResourceFailure,
  CogniResourceRejection,
  PredictionResourceRegistry,
  createPredictionExecutor,
} from "./resources";
export type {
  CogniResourceServerOptions,
  PredictionExecutor,
  PredictionExecutorInput,
  PredictionExecutorOptions,
  PredictionResourceDefinition,
  PredictionResourceInput,
  PredictionResourceResult,
} from "./resources";

export type {
  BackendCapabilities,
  PredictionAcceptedEvent,
  PredictionBatchRequest,
  PredictionBatchResponse,
  PredictionBatchSummary,
  PredictionBatchCompletedEvent,
  PredictionCandidateRequest,
  PredictionCost,
  PredictionEvent,
  PredictionFailedEvent,
  PredictionFailureCode,
  PredictionOutcome,
  PredictionOutcomeBatch,
  PredictionOutcomeRecord,
  PredictionRejectedEvent,
  PredictionRejectionReason,
  PredictionResolvedEvent,
  PredictionWork,
  Problem,
  ProtocolVersion,
  ResolvedResource,
  ResourceRequest,
} from "../../../protocol/types";

type Awaitable<Value> = Value | Promise<Value>;
type EventSource =
  | Iterable<PredictionEvent>
  | AsyncIterable<PredictionEvent>
  | Promise<Iterable<PredictionEvent> | AsyncIterable<PredictionEvent>>;

export interface CogniServerInput<Context> {
  readonly request: Request;
  readonly context: Context;
}

export interface CogniPredictionInput<Context> extends CogniServerInput<Context> {
  readonly batch: PredictionBatchRequest;
  readonly signal: AbortSignal;
}

export interface CogniOutcomeInput<Context> extends CogniServerInput<Context> {
  readonly batch: PredictionOutcomeBatch;
}

export interface CogniServerHandlers<Context> {
  readonly capabilities:
    | BackendCapabilities
    | ((input: CogniServerInput<Context>) => Awaitable<BackendCapabilities>);
  readonly predictions: (input: CogniPredictionInput<Context>) => EventSource;
  readonly outcomes: (input: CogniOutcomeInput<Context>) => Awaitable<void>;
}

export interface CogniServer<Context> {
  handleCapabilities(request: Request, context: Context): Promise<Response>;
  handlePredictions(request: Request, context: Context): Promise<Response>;
  handleOutcomes(request: Request, context: Context): Promise<Response>;
}

export class CogniServerError extends Error {
  readonly status: number;
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(problem.detail ?? problem.title);
    this.name = "CogniServerError";
    this.status = problem.status;
    this.problem = problem;
  }
}

/**
 * Creates route-independent protocol handlers for Node.js hosts. Authentication,
 * authorization, route registration, and construction of Context remain owned by
 * the host application.
 */
export function createCogniServer<Context>(
  handlers: CogniServerHandlers<Context>,
): CogniServer<Context> {
  return {
    async handleCapabilities(request, context) {
      const methodError = requirePost(request);
      if (methodError) return methodError;

      try {
        const value =
          typeof handlers.capabilities === "function"
            ? await handlers.capabilities({ request, context })
            : handlers.capabilities;
        return json(parseBackendCapabilities(value));
      } catch (error) {
        return errorResponse(error);
      }
    },

    async handlePredictions(request, context) {
      const requestError = validateJsonPost(request);
      if (requestError) return requestError;

      try {
        const batch = parsePredictionBatchRequest(await readJson(request));
        const source = await handlers.predictions({
          request,
          context,
          batch,
          signal: request.signal,
        });

        if (acceptsNdjson(request)) {
          return streamEvents(batch, source);
        }

        const events = await collectEvents(batch, source);
        return json({
          protocol_version: "1",
          request_id: batch.request_id,
          events,
        });
      } catch (error) {
        return errorResponse(error);
      }
    },

    async handleOutcomes(request, context) {
      const requestError = validateJsonPost(request);
      if (requestError) return requestError;

      try {
        const batch = parseOutcomeBatch(await readJson(request));
        await handlers.outcomes({ request, context, batch });
        return new Response(null, {
          status: 204,
          headers: { "cache-control": "no-store" },
        });
      } catch (error) {
        return errorResponse(error);
      }
    },
  };
}

/**
 * Convenience server for the common registry-backed implementation. Hosts may
 * still use createCogniServer directly when prediction work is orchestrated by
 * another runtime.
 */
export function createCogniResourceServer<Context>(
  options: CogniResourceServerOptions<Context>,
): CogniServer<Context> {
  const executor = createPredictionExecutor({
    registry: options.registry,
    capabilities: options.capabilities,
    ...options.executor,
  });
  return createCogniServer({
    capabilities: options.capabilities,
    predictions: (input) => executor.execute(input),
    outcomes: async (input) => {
      await options.outcomes?.(input);
    },
  });
}

function streamEvents(
  batch: PredictionBatchRequest,
  source: Iterable<PredictionEvent> | AsyncIterable<PredictionEvent>,
): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sequence = new PredictionEventSequence(batch);
      try {
        for await (const value of source) {
          const event = sequence.accept(value);
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
        sequence.finish();
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new Response(body, {
    headers: {
      "cache-control": "no-store",
      "content-type": `${NDJSON_MEDIA_TYPE}; charset=utf-8`,
    },
  });
}

async function collectEvents(
  batch: PredictionBatchRequest,
  source: Iterable<PredictionEvent> | AsyncIterable<PredictionEvent>,
): Promise<PredictionEvent[]> {
  const sequence = new PredictionEventSequence(batch);
  const events: PredictionEvent[] = [];
  for await (const value of source) events.push(sequence.accept(value));
  sequence.finish();
  return events;
}

function acceptsNdjson(request: Request): boolean {
  return (
    request.headers
      .get("accept")
      ?.split(",")
      .some((value) => value.trim().split(";", 1)[0] === NDJSON_MEDIA_TYPE) ?? false
  );
}

function requirePost(request: Request): Response | undefined {
  if (request.method === "POST") return undefined;
  return problem({
    type: "https://inttegro.com/problems/method-not-allowed",
    title: "Method not allowed",
    status: 405,
  });
}

function validateJsonPost(request: Request): Response | undefined {
  const methodError = requirePost(request);
  if (methodError) return methodError;
  const contentType = request.headers.get("content-type")?.split(";", 1)[0];
  if (contentType === JSON_MEDIA_TYPE) return undefined;
  return problem({
    type: "https://inttegro.com/problems/unsupported-media-type",
    title: "Unsupported media type",
    status: 415,
    detail: `Expected ${JSON_MEDIA_TYPE}`,
  });
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new CogniServerError({
      type: "https://inttegro.com/problems/invalid-json",
      title: "Invalid JSON",
      status: 400,
    });
  }
}

function json(value: unknown): Response {
  return Response.json(value, {
    headers: { "cache-control": "no-store", "content-type": JSON_MEDIA_TYPE },
  });
}

function problem(value: Problem): Response {
  return Response.json(value, {
    status: value.status,
    headers: {
      "cache-control": "no-store",
      "content-type": PROBLEM_MEDIA_TYPE,
    },
  });
}

function errorResponse(error: unknown): Response {
  if (error instanceof CogniServerError) return problem(error.problem);
  if (error instanceof CogniProtocolError) {
    return problem({
      type: "https://inttegro.com/problems/invalid-protocol-message",
      title: "Invalid Cogni protocol message",
      status: 400,
      detail: error.message,
    });
  }
  return problem({
    type: "https://inttegro.com/problems/internal-server-error",
    title: "Internal server error",
    status: 500,
  });
}
