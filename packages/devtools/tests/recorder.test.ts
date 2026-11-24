import { PredictionScheduler } from "@inttegro/cogni-client";
import { describe, expect, it, vi } from "vitest";

import { CogniDevtoolsRecorder } from "../src";

describe("CogniDevtoolsRecorder", () => {
  it("correlates scheduler and coordinator events into reusable traces", async () => {
    const scheduler = new PredictionScheduler();
    const recorder = new CogniDevtoolsRecorder(scheduler);
    const scheduled = scheduler.schedule(
      {
        key: "route:/orders",
        policy: "navigation",
        trigger: "hover",
        destination: "/orders",
        probability: 0.9,
        horizonMs: 10_000,
        estimatedBytes: 2_048,
      },
      async () => ({ bytes: 2_048 }),
      { idle: false },
    );

    const prediction = await scheduled.started;
    await vi.waitFor(() => expect(prediction?.status).toBe("waiting_for_reuse"));
    prediction?.markReused();
    await prediction?.completion;

    const snapshot = recorder.snapshot();
    expect(snapshot.traces).toHaveLength(1);
    expect(snapshot.traces[0]).toMatchObject({
      state: "reused",
      bytes: 2_048,
      materialWork: true,
      startMode: "eligible",
    });
    expect(snapshot.summary).toMatchObject({
      active: 0,
      materialOutcomes: 1,
      reused: 1,
      reusedBytes: 2_048,
      wastedBytes: 0,
      reuseRate: 1,
      expectedReuseRate: 0.9,
    });
    expect(snapshot.entries.map((entry) => entry.type)).toEqual(
      expect.arrayContaining(["scheduled", "accepted", "started", "loaded", "reused"]),
    );
    recorder.dispose();
    vi.useRealTimers();
  });

  it("bounds retained entries and records missed bytes as waste", async () => {
    vi.useFakeTimers();
    const scheduler = new PredictionScheduler();
    const recorder = new CogniDevtoolsRecorder(scheduler, { maxEntries: 3 });
    scheduler.schedule(
      {
        key: "route:/products",
        policy: "navigation",
        trigger: "idle",
        destination: "/products",
        probability: 0.8,
        horizonMs: 10,
        estimatedBytes: 500,
      },
      async () => ({ bytes: 500 }),
      { idle: false },
    );

    await vi.runAllTimersAsync();
    const snapshot = recorder.snapshot();
    expect(snapshot.entries).toHaveLength(3);
    expect(snapshot.summary).toMatchObject({
      missed: 1,
      totalBytes: 500,
      reusedBytes: 0,
      wastedBytes: 500,
      reuseRate: 0,
    });
    recorder.dispose();
  });
});
