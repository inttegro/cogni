import { describe, expect, it, vi } from "vitest";

import { createCogniBackendClient } from "../packages/client/src/protocol";
import {
  PredictionResourceRegistry,
  createCogniResourceServer,
  type BackendCapabilities,
  type PredictionBatchRequest,
  type PredictionOutcomeBatch,
} from "../packages/server/src";

const routes = {
  capabilities: "/internal/predict/capabilities",
  predictions: "/internal/predict/run",
  outcomes: "/internal/predict/outcomes",
};

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

describe("Cogni client and server conformance", () => {
  it("uses host routes, streams resources, and reports reuse", async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const registry = new PredictionResourceRegistry<{ accountId: string }>();
    registry.register("products.page", {
      resolve: async ({ context }) => {
        expect(context).toEqual({ accountId: "app_123" });
        await blocked;
        return {
          payload: { products: [{ id: "prod_1" }] },
          bytes: 42,
        };
      },
    });
    const reportOutcomes = vi.fn(async () => undefined);
    const server = createCogniResourceServer({
      registry,
      capabilities,
      outcomes: reportOutcomes,
    });
    const fetch = routeFetch(server, { accountId: "app_123" });
    const client = createCogniBackendClient({ routes, fetch });

    await expect(client.capabilities()).resolves.toEqual(capabilities);

    const observed: string[] = [];
    let accepted!: () => void;
    const sawAccepted = new Promise<void>((resolve) => {
      accepted = resolve;
    });
    let executionSettled = false;
    const execution = client
      .executePredictions(request(), {
        transport: "ndjson",
        onEvent(event) {
          observed.push(event.type);
          if (event.type === "prediction.accepted") accepted();
        },
      })
      .finally(() => {
        executionSettled = true;
      });

    await sawAccepted;
    expect(executionSettled).toBe(false);
    release();
    const events = await execution;

    expect(observed).toEqual([
      "prediction.accepted",
      "prediction.resolved",
      "batch.completed",
    ]);
    expect(events[1]).toMatchObject({
      type: "prediction.resolved",
      resource: {
        name: "products.page",
        cache_key: "products:first-page",
        payload: { products: [{ id: "prod_1" }] },
      },
      work: { bytes: 42 },
    });

    const outcomes: PredictionOutcomeBatch = {
      protocol_version: "1",
      request_id: "outcome_1",
      outcomes: [
        {
          prediction_id: "pred_1",
          outcome: "reused",
          observed_at: new Date().toISOString(),
          lead_time_ms: 120,
        },
      ],
    };
    await client.reportOutcomes(outcomes);
    expect(reportOutcomes).toHaveBeenCalledWith(
      expect.objectContaining({
        context: { accountId: "app_123" },
        batch: outcomes,
      }),
    );
  });
});

function request(): PredictionBatchRequest {
  return {
    protocol_version: "1",
    request_id: "req_1",
    candidates: [
      {
        prediction_id: "pred_1",
        resource: {
          name: "products.page",
          cache_key: "products:first-page",
          parameters: { page: 1 },
        },
        policy: "host.catalog",
        trigger: "idle",
        probability: 0.9,
        horizon_ms: 10_000,
        cost: "standard",
      },
    ],
  };
}

function routeFetch<Context>(
  server: ReturnType<typeof createCogniResourceServer<Context>>,
  context: Context,
): typeof fetch {
  return async (input, init) => {
    const request = new Request(new URL(String(input), "https://example.test"), init);
    const path = new URL(request.url).pathname;
    if (path === routes.capabilities) {
      return server.handleCapabilities(request, context);
    }
    if (path === routes.predictions) {
      return server.handlePredictions(request, context);
    }
    if (path === routes.outcomes) {
      return server.handleOutcomes(request, context);
    }
    return new Response(null, { status: 404 });
  };
}
