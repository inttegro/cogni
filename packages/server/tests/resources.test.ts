import { describe, expect, it, vi } from "vitest";

import {
  CogniResourceRejection,
  PredictionResourceRegistry,
  createPredictionExecutor,
  type BackendCapabilities,
  type PredictionBatchRequest,
  type PredictionCandidateRequest,
  type PredictionEvent,
} from "../src";

const capabilities: BackendCapabilities = {
  protocol_version: "1",
  transports: ["application/json", "application/x-ndjson"],
  representations: ["application/json"],
  limits: {
    max_candidates_per_batch: 8,
    max_horizon_ms: 60_000,
  },
  outcome_reporting: true,
};

describe("Prediction resource executor", () => {
  it("validates parameters before acceptance", async () => {
    const resolve = vi.fn(async () => ({ payload: { ok: true } }));
    const registry = new PredictionResourceRegistry<{ accountId: string }>();
    registry.register("products.page", {
      validate(parameters) {
        if (typeof parameters.page !== "number") {
          throw new CogniResourceRejection("invalid_parameters");
        }
        return { page: parameters.page } as Readonly<{ page: number }>;
      },
      resolve,
    });
    const executor = createPredictionExecutor({ registry, capabilities });

    const events = await collect(
      executor.execute(
        input(batch([candidate("bad", "products.page", { page: "one" })])),
      ),
    );

    expect(events.map((event) => event.type)).toEqual([
      "prediction.rejected",
      "batch.completed",
    ]);
    expect(events[0]).toMatchObject({ reason: "invalid_parameters" });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("applies confidence, availability, and batch-budget admission", async () => {
    const registry = new PredictionResourceRegistry<undefined>();
    registry.register("known", {
      resolve: async () => ({ payload: null }),
    });
    const executor = createPredictionExecutor({
      registry,
      capabilities: {
        ...capabilities,
        limits: { ...capabilities.limits, max_candidates_per_batch: 1 },
      },
    });

    const events = await collect(
      executor.execute(
        input(
          batch([
            candidate("best", "known", {}, { priority: 10 }),
            candidate("budget", "known", {}, { priority: 1 }),
            candidate("unknown", "missing"),
            candidate("quality", "known", {}, { probability: 0.5 }),
          ]),
        ),
      ),
    );

    expect(
      events
        .filter((event) => event.type === "prediction.rejected")
        .map((event) => [event.prediction_id, event.reason]),
    ).toEqual([
      ["budget", "budget_exhausted"],
      ["unknown", "budget_exhausted"],
      ["quality", "below_quality_gate"],
    ]);
    expect(events.at(-1)).toMatchObject({
      type: "batch.completed",
      summary: { accepted: 1, resolved: 1, rejected: 3, failed: 0 },
    });
  });

  it("passes authenticated context and streams completion order with a bound", async () => {
    const releases = new Map<string, () => void>();
    let inFlight = 0;
    let maximumInFlight = 0;
    const registry = new PredictionResourceRegistry<{ accountId: string }>();
    registry.register("account.data", {
      resolve: async ({ context, candidate }) => {
        expect(context.accountId).toBe("app_123");
        inFlight += 1;
        maximumInFlight = Math.max(maximumInFlight, inFlight);
        await new Promise<void>((resolve) => {
          releases.set(candidate.prediction_id, resolve);
        });
        inFlight -= 1;
        return { payload: { id: candidate.prediction_id } };
      },
    });
    const executor = createPredictionExecutor({
      registry,
      capabilities,
      maxConcurrent: 2,
    });
    const iterator = executor
      .execute(
        input(
          batch([
            candidate("first", "account.data"),
            candidate("second", "account.data"),
            candidate("third", "account.data"),
          ]),
          { accountId: "app_123" },
        ),
      )
      [Symbol.asyncIterator]();

    expect((await iterator.next()).value).toMatchObject({
      type: "prediction.accepted",
      prediction_id: "first",
    });
    expect((await iterator.next()).value).toMatchObject({
      type: "prediction.accepted",
      prediction_id: "second",
    });
    const terminal = iterator.next();
    await vi.waitFor(() => expect(releases.size).toBe(2));
    releases.get("second")?.();
    expect((await terminal).value).toMatchObject({
      type: "prediction.resolved",
      prediction_id: "second",
    });
    expect((await iterator.next()).value).toMatchObject({
      type: "prediction.accepted",
      prediction_id: "third",
    });
    expect(maximumInFlight).toBe(2);

    const nextTerminal = iterator.next();
    releases.get("first")?.();
    await nextTerminal;
    const finalTerminal = iterator.next();
    releases.get("third")?.();
    await finalTerminal;
    expect((await iterator.next()).value).toMatchObject({
      type: "batch.completed",
      summary: { accepted: 3, resolved: 3, rejected: 0, failed: 0 },
    });
  });

  it("isolates deadline failures per candidate", async () => {
    const registry = new PredictionResourceRegistry<undefined>();
    registry.register("slow", {
      resolve: async () => new Promise(() => undefined),
    });
    const executor = createPredictionExecutor({ registry, capabilities });

    const events = await collect(
      executor.execute(
        input(batch([candidate("deadline", "slow", {}, { horizon_ms: 5 })])),
      ),
    );

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "prediction.failed",
        prediction_id: "deadline",
        code: "deadline_exceeded",
      }),
    );
    expect(events.at(-1)).toMatchObject({
      type: "batch.completed",
      summary: { accepted: 1, resolved: 0, rejected: 0, failed: 1 },
    });
  });

  it("does not invoke a resource after the request is already cancelled", async () => {
    const resolve = vi.fn(async () => ({ payload: null }));
    const registry = new PredictionResourceRegistry<undefined>();
    registry.register("cancelled", { resolve });
    const executor = createPredictionExecutor({ registry, capabilities });
    const controller = new AbortController();
    controller.abort("navigation changed");

    const events = await collect(
      executor.execute({
        ...input(batch([candidate("cancelled", "cancelled")])),
        signal: controller.signal,
      }),
    );

    expect(resolve).not.toHaveBeenCalled();
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "prediction.failed",
        prediction_id: "cancelled",
        code: "cancelled",
      }),
    );
  });
});

function candidate(
  predictionId: string,
  resourceName: string,
  parameters: Readonly<Record<string, unknown>> = {},
  overrides: Partial<PredictionCandidateRequest> = {},
): PredictionCandidateRequest {
  return {
    prediction_id: predictionId,
    resource: {
      name: resourceName,
      cache_key: `${resourceName}:${predictionId}`,
      parameters,
    },
    policy: "host.parity",
    trigger: "idle",
    probability: 0.9,
    horizon_ms: 10_000,
    cost: "standard",
    ...overrides,
  };
}

function batch(candidates: PredictionCandidateRequest[]): PredictionBatchRequest {
  return {
    protocol_version: "1",
    request_id: "req_parity",
    candidates,
  };
}

function input<Context = undefined>(
  requestBatch: PredictionBatchRequest,
  context?: Context,
) {
  const request = new Request("https://example.test/predict", { method: "POST" });
  return {
    context: context as Context,
    request,
    batch: requestBatch,
    signal: request.signal,
  };
}

async function collect(
  source: AsyncIterable<PredictionEvent>,
): Promise<PredictionEvent[]> {
  const events: PredictionEvent[] = [];
  for await (const event of source) events.push(event);
  return events;
}
