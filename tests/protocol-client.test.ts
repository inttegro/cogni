import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import {
  CogniProtocolError,
  createCogniBackendClient,
  type BackendCapabilities,
  type PredictionBatchRequest,
  type PredictionEvent,
  type PredictionOutcomeBatch,
} from "../src/protocol";

const fixtureRoot = new URL("../protocol/conformance/", import.meta.url);
const routes = {
  capabilities: "/internal/predict/capabilities",
  predictions: "/internal/predict/execute",
  outcomes: "/internal/predict/outcomes",
} as const;

describe("Cogni backend protocol client", () => {
  it("requires the host to provide every operation route", () => {
    expect(() => createCogniBackendClient({ routes: {} } as never)).toThrow(
      "routes.capabilities, routes.predictions, and routes.outcomes are required",
    );
  });

  it("negotiates backend capabilities without owning host credentials", async () => {
    const capabilities = await fixture<BackendCapabilities>(
      "capabilities-response.json",
    );
    const fetchImplementation = vi.fn(async () =>
      Response.json(capabilities, {
        headers: { "content-type": "application/json" },
      }),
    );
    const client = createCogniBackendClient({ routes, fetch: fetchImplementation });

    await expect(client.capabilities()).resolves.toEqual(capabilities);
    expect(fetchImplementation).toHaveBeenCalledWith(
      routes.capabilities,
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
      }),
    );
  });

  it("delivers validated NDJSON events as soon as they arrive", async () => {
    const request = await fixture<PredictionBatchRequest>("prediction-request.json");
    const ndjson = await readFile(
      new URL("prediction-events.ndjson", fixtureRoot),
      "utf8",
    );
    const lines = ndjson.trim().split("\n");
    const encoder = new TextEncoder();
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
      },
    });
    const fetchImplementation = vi.fn(
      async () =>
        new Response(stream, {
          headers: { "content-type": "application/x-ndjson" },
        }),
    );
    const observed: PredictionEvent[] = [];
    const client = createCogniBackendClient({ routes, fetch: fetchImplementation });

    const pendingEvents = client.executePredictions(request, {
      onEvent: (event) => {
        observed.push(event);
      },
    });

    streamController.enqueue(encoder.encode(`${lines[0]}\n`));
    await vi.waitFor(() => expect(observed).toHaveLength(1));
    expect(observed[0]?.type).toBe("prediction.accepted");

    streamController.enqueue(encoder.encode(`${lines[1]}\n`));
    await vi.waitFor(() => expect(observed).toHaveLength(2));
    expect(observed[1]?.type).toBe("prediction.resolved");

    streamController.enqueue(encoder.encode(lines[2]));
    streamController.close();
    const events = await pendingEvents;

    expect(events).toHaveLength(3);
    expect(observed).toEqual(events);
    expect(events.map(({ type }) => type)).toEqual([
      "prediction.accepted",
      "prediction.resolved",
      "batch.completed",
    ]);
    expect(fetchImplementation).toHaveBeenCalledWith(
      routes.predictions,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("accepts the JSON envelope fallback with the same event ordering", async () => {
    const request = await fixture<PredictionBatchRequest>("prediction-request.json");
    const events = await predictionEventsFixture();
    const fetchImplementation = vi.fn(async () =>
      Response.json(
        {
          protocol_version: "1",
          request_id: request.request_id,
          events,
        },
        { headers: { "content-type": "application/json" } },
      ),
    );
    const client = createCogniBackendClient({ routes, fetch: fetchImplementation });

    await expect(
      client.executePredictions(request, { transport: "json" }),
    ).resolves.toEqual(events);
  });

  it("rejects backend event sequences that cannot be reused safely", async () => {
    const request = await fixture<PredictionBatchRequest>("prediction-request.json");
    const events = await predictionEventsFixture();
    const invalidEvents = events.filter(({ type }) => type !== "prediction.accepted");
    const fetchImplementation = vi.fn(async () =>
      Response.json(
        {
          protocol_version: "1",
          request_id: request.request_id,
          events: invalidEvents,
        },
        { headers: { "content-type": "application/json" } },
      ),
    );
    const client = createCogniBackendClient({ routes, fetch: fetchImplementation });

    await expect(
      client.executePredictions(request, { transport: "json" }),
    ).rejects.toThrow(CogniProtocolError);
  });

  it("rejects malformed resolved resources before exposing them to the cache", async () => {
    const request = await fixture<PredictionBatchRequest>("prediction-request.json");
    const events = await predictionEventsFixture();
    const malformed = structuredClone(events) as unknown as Array<
      Record<string, unknown>
    >;
    const resolved = malformed.find(({ type }) => type === "prediction.resolved");
    if (!resolved || typeof resolved.resource !== "object" || !resolved.resource) {
      throw new TypeError("fixture has no resolved resource");
    }
    delete (resolved.resource as Record<string, unknown>).payload;
    const onEvent = vi.fn();
    const fetchImplementation = vi.fn(async () =>
      Response.json(
        {
          protocol_version: "1",
          request_id: request.request_id,
          events: malformed,
        },
        { headers: { "content-type": "application/json" } },
      ),
    );
    const client = createCogniBackendClient({ routes, fetch: fetchImplementation });

    await expect(
      client.executePredictions(request, { transport: "json", onEvent }),
    ).rejects.toThrow("prediction.resolved is malformed");
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it("reports reuse outcomes through the language-neutral endpoint", async () => {
    const outcomes = await fixture<PredictionOutcomeBatch>("outcomes-request.json");
    const fetchImplementation = vi.fn(async () => new Response(null, { status: 204 }));
    const client = createCogniBackendClient({ routes, fetch: fetchImplementation });

    await client.reportOutcomes(outcomes);

    expect(fetchImplementation).toHaveBeenCalledWith(
      routes.outcomes,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(outcomes),
      }),
    );
  });
});

async function fixture<Value>(name: string): Promise<Value> {
  return JSON.parse(await readFile(new URL(name, fixtureRoot), "utf8")) as Value;
}

async function predictionEventsFixture(): Promise<PredictionEvent[]> {
  const ndjson = await readFile(
    new URL("prediction-events.ndjson", fixtureRoot),
    "utf8",
  );
  return ndjson
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as PredictionEvent);
}
