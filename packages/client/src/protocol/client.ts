import {
  COGNI_PROTOCOL_VERSION,
  CogniProtocolError,
  JSON_MEDIA_TYPE,
  NDJSON_MEDIA_TYPE,
  PROBLEM_MEDIA_TYPE,
  PredictionEventSequence,
  isProblem,
  isRecord,
  parseBackendCapabilities,
  parseOutcomeBatch,
  parsePredictionBatchRequest,
} from "../../../../protocol/runtime";
import type {
  BackendCapabilities,
  PredictionBatchRequest,
  PredictionEvent,
  PredictionOutcomeBatch,
  Problem,
} from "../../../../protocol/types";

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

export { CogniProtocolError };

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
      return parseBackendCapabilities(await response.json());
    },

    async executePredictions(requestBody, executionOptions = {}) {
      const validatedRequest = parsePredictionBatchRequest(requestBody);
      const transport = executionOptions.transport ?? "ndjson";
      const response = await request(
        options.routes.predictions,
        {
          method: "POST",
          body: JSON.stringify(validatedRequest),
          signal: executionOptions.signal ?? null,
        },
        transport === "ndjson" ? NDJSON_MEDIA_TYPE : JSON_MEDIA_TYPE,
      );
      const contentType = response.headers.get("content-type")?.split(";", 1)[0];
      const sequence = new PredictionEventSequence(validatedRequest);
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
          value.protocol_version !== COGNI_PROTOCOL_VERSION ||
          value.request_id !== validatedRequest.request_id ||
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
      const validatedOutcomes = parseOutcomeBatch(outcomes);
      const response = await request(
        options.routes.outcomes,
        {
          method: "POST",
          body: JSON.stringify(validatedOutcomes),
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
  if (contentType !== PROBLEM_MEDIA_TYPE) {
    return new CogniBackendError(response.status);
  }
  const value: unknown = await response.json().catch(() => undefined);
  return new CogniBackendError(response.status, isProblem(value) ? value : undefined);
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
