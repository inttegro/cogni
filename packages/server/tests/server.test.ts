import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import {
  createCogniServer,
  type BackendCapabilities,
  type PredictionBatchRequest,
  type PredictionEvent,
  type PredictionOutcomeBatch,
} from "../src";

const fixtureRoot = new URL("../../../protocol/conformance/", import.meta.url);

describe("Cogni Node server", () => {
  it("exposes route-independent capability handling", async () => {
    const capabilities = await fixture<BackendCapabilities>(
      "capabilities-response.json",
    );
    const server = createCogniServer({
      capabilities,
      predictions: async function* () {},
      outcomes: async () => undefined,
    });

    const response = await server.handleCapabilities(
      new Request("https://example.test/host/selected/path", { method: "POST" }),
      undefined,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(capabilities);
  });

  it("streams validated events before prediction work completes", async () => {
    const capabilities = await fixture<BackendCapabilities>(
      "capabilities-response.json",
    );
    const batch = await fixture<PredictionBatchRequest>("prediction-request.json");
    const events = await predictionEventsFixture();
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const observedContext = vi.fn();
    const server = createCogniServer<{ accountId: string }>({
      capabilities,
      predictions: async function* ({ context }) {
        observedContext(context);
        yield events[0]!;
        await wait;
        yield* events.slice(1);
      },
      outcomes: async () => undefined,
    });
    const response = await server.handlePredictions(
      jsonRequest("https://example.test/predict", batch, {
        accept: "application/x-ndjson",
      }),
      { accountId: "app_123" },
    );
    const reader = response.body?.getReader();
    if (!reader) throw new TypeError("streaming response has no body");

    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain(
      '"type":"prediction.accepted"',
    );
    expect(observedContext).toHaveBeenCalledWith({ accountId: "app_123" });

    release();
    let remainder = "";
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      remainder += new TextDecoder().decode(part.value);
    }
    expect(remainder).toContain('"type":"prediction.resolved"');
    expect(remainder).toContain('"type":"batch.completed"');
  });

  it("returns the same event sequence as a JSON envelope", async () => {
    const capabilities = await fixture<BackendCapabilities>(
      "capabilities-response.json",
    );
    const batch = await fixture<PredictionBatchRequest>("prediction-request.json");
    const events = await predictionEventsFixture();
    const server = createCogniServer({
      capabilities,
      predictions: async function* () {
        yield* events;
      },
      outcomes: async () => undefined,
    });

    const response = await server.handlePredictions(
      jsonRequest("https://example.test/predict", batch, {
        accept: "application/json",
      }),
      undefined,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      protocol_version: "1",
      request_id: batch.request_id,
      events,
    });
  });

  it("rejects malformed protocol messages before calling the host", async () => {
    const capabilities = await fixture<BackendCapabilities>(
      "capabilities-response.json",
    );
    const predictions = vi.fn(async function* () {});
    const server = createCogniServer({
      capabilities,
      predictions,
      outcomes: async () => undefined,
    });

    const response = await server.handlePredictions(
      jsonRequest("https://example.test/predict", { protocol_version: "1" }),
      undefined,
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect(predictions).not.toHaveBeenCalled();
  });

  it("passes validated outcomes to the host and returns 204", async () => {
    const capabilities = await fixture<BackendCapabilities>(
      "capabilities-response.json",
    );
    const outcomes = await fixture<PredictionOutcomeBatch>("outcomes-request.json");
    const report = vi.fn(async () => undefined);
    const server = createCogniServer({
      capabilities,
      predictions: async function* () {},
      outcomes: report,
    });

    const response = await server.handleOutcomes(
      jsonRequest("https://example.test/outcomes", outcomes),
      undefined,
    );

    expect(response.status).toBe(204);
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ batch: outcomes }));
  });
});

function jsonRequest(
  url: string,
  value: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(value),
  });
}

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
