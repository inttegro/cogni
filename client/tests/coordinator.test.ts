import { describe, expect, it, vi } from "vitest";

import { PredictionCoordinator } from "../src";
import type {
  PredictionCandidate,
  PredictionRuntime,
  PredictionScheduledTask,
} from "../src";

function candidate(
  key: string,
  overrides: Partial<PredictionCandidate> = {},
): PredictionCandidate {
  return {
    key,
    policy: "navigation",
    trigger: "idle",
    destination: `/${key}`,
    probability: 0.8,
    horizonMs: 1_000,
    ...overrides,
  };
}

describe("PredictionCoordinator", () => {
  it("uses an injected runtime for deadlines", async () => {
    const runtime = new ManualRuntime();
    const coordinator = new PredictionCoordinator({ runtime });
    const handle = coordinator.predict(
      candidate("runtime", { horizonMs: 100 }),
      async () => undefined,
    );

    await vi.waitFor(() => expect(handle.status).toBe("waiting_for_reuse"));
    runtime.advanceBy(100);

    expect((await handle.completion).outcome).toBe("missed");
  });

  it("enforces the default and high-cost confidence gates", async () => {
    const coordinator = new PredictionCoordinator();
    const loader = vi.fn(async () => undefined);

    const ordinary = coordinator.predict(
      candidate("ordinary", { probability: 0.79 }),
      loader,
    );
    const expensive = coordinator.predict(
      candidate("expensive", { probability: 0.89, cost: "high" }),
      loader,
    );

    expect(ordinary.accepted).toBe(false);
    expect(expensive.accepted).toBe(false);
    expect((await ordinary.completion).reason).toBe("below_quality_gate");
    expect((await expensive.completion).reason).toBe("below_quality_gate");
    expect(loader).not.toHaveBeenCalled();
  });

  it("requires high-cost gates to be at least as strict as ordinary gates", () => {
    expect(
      () =>
        new PredictionCoordinator({
          minimumProbability: 0.9,
          highCostMinimumProbability: 0.8,
        }),
    ).toThrow("highCostMinimumProbability must be at least minimumProbability");
  });

  it("runs higher-priority queued work first", async () => {
    let releaseFirst!: () => void;
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const order: string[] = [];
    const coordinator = new PredictionCoordinator({ maxConcurrent: 1 });

    const first = coordinator.predict(candidate("first"), async () => {
      order.push("first");
      await firstBlocked;
    });
    const low = coordinator.predict(candidate("low", { priority: 1 }), async () => {
      order.push("low");
    });
    const high = coordinator.predict(candidate("high", { priority: 10 }), async () => {
      order.push("high");
    });

    expect(order).toEqual(["first"]);
    releaseFirst();
    await vi.waitFor(() => expect(order).toEqual(["first", "high", "low"]));
    first.cancel();
    high.cancel();
    low.cancel();
  });

  it("deduplicates active work by candidate key", async () => {
    const loader = vi.fn(async () => undefined);
    const coordinator = new PredictionCoordinator();

    const first = coordinator.predict(candidate("same"), loader);
    const second = coordinator.predict(candidate("same"), loader);

    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(true);
    expect(second.deduplicated).toBe(true);
    expect(loader).toHaveBeenCalledTimes(1);
    first.cancel();
  });

  it("records reused work and transferred bytes", async () => {
    const coordinator = new PredictionCoordinator();
    const handle = coordinator.predict(candidate("products"), async () => ({
      bytes: 4_096,
    }));

    await vi.waitFor(() => expect(handle.status).toBe("waiting_for_reuse"));
    expect(handle.markReused()).toBe(true);
    expect((await handle.completion).outcome).toBe("reused");
    expect(coordinator.quality()).toMatchObject({
      materialOutcomes: 1,
      reused: 1,
      totalBytes: 4_096,
      reusedBytes: 4_096,
      reuseRate: 1,
      byteReuseRate: 1,
    });
  });

  it("counts material work that expires as a miss", async () => {
    vi.useFakeTimers();
    const coordinator = new PredictionCoordinator();
    const handle = coordinator.predict(
      candidate("orders", { horizonMs: 100, estimatedBytes: 2_048 }),
      async () => undefined,
    );

    await vi.runAllTimersAsync();
    expect((await handle.completion).outcome).toBe("missed");
    expect(coordinator.quality()).toMatchObject({
      materialOutcomes: 1,
      missed: 1,
      totalBytes: 2_048,
      reuseRate: 0,
      byteReuseRate: 0,
    });
    vi.useRealTimers();
  });

  it("does not call an already-cached resource predictive work", async () => {
    const coordinator = new PredictionCoordinator();
    const handle = coordinator.predict(candidate("cached"), async () => ({
      materialWork: false,
    }));

    await vi.waitFor(() => expect(handle.status).toBe("waiting_for_reuse"));
    handle.markReused();
    await handle.completion;
    expect(coordinator.quality()).toMatchObject({
      outcomes: 1,
      materialOutcomes: 0,
      reused: 0,
      reuseRate: null,
    });
  });

  it("aborts running work when disposed", async () => {
    const coordinator = new PredictionCoordinator();
    let observedSignal: AbortSignal | undefined;
    const handle = coordinator.predict(candidate("slow"), async ({ signal }) => {
      observedSignal = signal;
      await new Promise<void>(() => undefined);
    });

    coordinator.dispose();

    expect(observedSignal?.aborted).toBe(true);
    expect((await handle.completion).outcome).toBe("cancelled");
    expect(coordinator.quality()).toMatchObject({
      materialOutcomes: 1,
      cancelledWithWork: 1,
      reuseRate: 0,
    });
  });

  it("isolates telemetry failures from predictive work", async () => {
    const coordinator = new PredictionCoordinator({
      onEvent: () => {
        throw new Error("telemetry unavailable");
      },
    });
    const handle = coordinator.predict(candidate("safe"), async () => undefined);

    await vi.waitFor(() => expect(handle.status).toBe("waiting_for_reuse"));
    handle.markReused();
    expect((await handle.completion).outcome).toBe("reused");
  });

  it("turns synchronous loader failures into measured misses", async () => {
    const coordinator = new PredictionCoordinator();
    const handle = coordinator.predict(candidate("throws"), () => {
      throw new Error("loader failed before returning a promise");
    });

    const result = await handle.completion;
    expect(result.outcome).toBe("failed");
    expect(result.error).toBeInstanceOf(Error);
    expect(coordinator.quality()).toMatchObject({
      materialOutcomes: 1,
      failed: 1,
      reuseRate: 0,
    });
  });
});

class ManualRuntime implements PredictionRuntime {
  #now = 0;
  readonly #tasks: Array<{
    at: number;
    cancelled: boolean;
    task: () => void;
  }> = [];

  now(): number {
    return this.#now;
  }

  schedule(delayMs: number, task: () => void): PredictionScheduledTask {
    const scheduled = {
      at: this.#now + delayMs,
      cancelled: false,
      task,
    };
    this.#tasks.push(scheduled);
    return {
      cancel() {
        scheduled.cancelled = true;
      },
    };
  }

  advanceBy(durationMs: number): void {
    this.#now += durationMs;
    for (const scheduled of this.#tasks) {
      if (!scheduled.cancelled && scheduled.at <= this.#now) {
        scheduled.cancelled = true;
        scheduled.task();
      }
    }
  }
}
