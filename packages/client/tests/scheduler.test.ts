import { describe, expect, it, vi } from "vitest";

import { PredictionScheduler } from "../src";
import type {
  PredictionCandidate,
  PredictionScheduledTask,
  PredictionSchedulerRuntime,
} from "../src";

function candidate(
  key: string,
  overrides: Partial<PredictionCandidate> = {},
): PredictionCandidate {
  return {
    key,
    policy: "host.account-routes",
    trigger: "idle",
    destination: `/${key}`,
    probability: 0.9,
    horizonMs: 20_000,
    ...overrides,
  };
}

describe("PredictionScheduler", () => {
  it("waits for the configured delay and an idle opportunity", async () => {
    const runtime = new ManualSchedulerRuntime();
    const loader = vi.fn(async () => undefined);
    const scheduler = new PredictionScheduler({ runtime });

    const scheduled = scheduler.schedule(candidate("catalog"), loader, {
      delayMs: 500,
      idle: true,
      idleTimeoutMs: 2_500,
    });

    runtime.advanceBy(499);
    expect(loader).not.toHaveBeenCalled();
    runtime.advanceBy(1);
    expect(loader).not.toHaveBeenCalled();
    runtime.runIdle();
    expect(loader).toHaveBeenCalledTimes(1);
    expect((await scheduled.started)?.accepted).toBe(true);
  });

  it("defers background work while foreground requests are active", () => {
    const runtime = new ManualSchedulerRuntime();
    const loader = vi.fn(async () => undefined);
    const scheduler = new PredictionScheduler({
      runtime,
      foregroundActivity: 1,
    });

    scheduler.schedule(candidate("queries"), loader, { delayMs: 3_000 });
    runtime.advanceBy(10_000);
    runtime.runIdle();
    expect(loader).not.toHaveBeenCalled();

    scheduler.setForegroundActivity(0);
    runtime.advanceBy(2_999);
    runtime.runIdle();
    expect(loader).not.toHaveBeenCalled();
    runtime.advanceBy(1);
    runtime.runIdle();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("uses a hard defer ceiling for route warmup", () => {
    const runtime = new ManualSchedulerRuntime();
    const loader = vi.fn(async () => undefined);
    const scheduler = new PredictionScheduler({
      runtime,
      foregroundActivity: 1,
    });

    scheduler.schedule(candidate("products"), loader, {
      delayMs: 500,
      maxDeferMs: 750,
    });
    runtime.advanceBy(749);
    expect(loader).not.toHaveBeenCalled();
    runtime.advanceBy(1);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("never lets a defer ceiling bypass the environment gate", () => {
    const runtime = new ManualSchedulerRuntime();
    const loader = vi.fn(async () => undefined);
    const scheduler = new PredictionScheduler({
      runtime,
      foregroundActivity: 1,
      environmentAllowed: false,
    });

    scheduler.schedule(candidate("hidden"), loader, { maxDeferMs: 750 });
    runtime.advanceBy(2_000);
    expect(loader).not.toHaveBeenCalled();

    scheduler.setEnvironmentAllowed(true);
    runtime.advanceBy(749);
    expect(loader).not.toHaveBeenCalled();
    runtime.advanceBy(1);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("lets direct intent bypass delay, idle, and foreground waits", () => {
    const runtime = new ManualSchedulerRuntime();
    const loader = vi.fn(async () => undefined);
    const scheduler = new PredictionScheduler({
      runtime,
      foregroundActivity: 2,
    });

    const scheduled = scheduler.schedule(candidate("order"), loader, {
      delayMs: 5_000,
    });
    scheduled.startNow();

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("deduplicates work while it is waiting to start", () => {
    const runtime = new ManualSchedulerRuntime();
    const loader = vi.fn(async () => undefined);
    const scheduler = new PredictionScheduler({ runtime });

    const first = scheduler.schedule(candidate("same"), loader, { delayMs: 100 });
    const second = scheduler.schedule(candidate("same"), loader, { delayMs: 100 });

    expect(second.started).toBe(first.started);
    runtime.advanceBy(100);
    runtime.runIdle();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("starts higher-priority eligible work first", () => {
    const runtime = new ManualSchedulerRuntime();
    const order: string[] = [];
    const scheduler = new PredictionScheduler({ runtime });

    scheduler.schedule(
      candidate("low", { priority: 1 }),
      async () => {
        order.push("low");
      },
      { delayMs: 100 },
    );
    scheduler.schedule(
      candidate("high", { priority: 10 }),
      async () => {
        order.push("high");
      },
      { delayMs: 100 },
    );

    runtime.advanceBy(100);
    runtime.runIdle();
    runtime.runIdle();
    expect(order).toEqual(["high", "low"]);
  });

  it("forwards cache invalidation cancellation after work has started", async () => {
    const runtime = new ManualSchedulerRuntime();
    const scheduler = new PredictionScheduler({ runtime });
    const scheduled = scheduler.schedule(
      candidate("invalidated"),
      async () => new Promise(() => undefined),
      { idle: false },
    );
    const prediction = await scheduled.started;

    scheduler.cancel("invalidated");

    await expect(prediction?.completion).resolves.toMatchObject({
      outcome: "cancelled",
      reason: "cancelled_by_host",
    });
  });

  it("reports scheduling, escalation, gate, and cancellation events", () => {
    const runtime = new ManualSchedulerRuntime();
    const events: string[] = [];
    const scheduler = new PredictionScheduler({
      runtime,
      environmentAllowed: false,
      onEvent: (event) => events.push(event.type),
    });
    const subscribed: string[] = [];
    const unsubscribe = scheduler.subscribe((event) => subscribed.push(event.type));

    const scheduled = scheduler.schedule(candidate("observed"), async () => undefined, {
      delayMs: 100,
      idle: false,
    });
    scheduler.setForegroundActivity(1);
    scheduler.setEnvironmentAllowed(true);
    scheduled.startNow();
    unsubscribe();
    scheduler.schedule(candidate("cancelled"), async () => undefined).cancel();

    expect(events).toEqual([
      "scheduled",
      "foreground_activity_changed",
      "environment_changed",
      "schedule_escalated",
      "schedule_started",
      "scheduled",
      "schedule_cancelled",
    ]);
    expect(subscribed).toEqual(events.slice(0, 5));
  });
});

class ManualSchedulerRuntime implements PredictionSchedulerRuntime {
  #now = 0;
  readonly #timers: Task[] = [];
  readonly #idle: Task[] = [];

  now(): number {
    return this.#now;
  }

  schedule(delayMs: number, task: () => void): PredictionScheduledTask {
    return this.#add(this.#timers, this.#now + delayMs, task);
  }

  scheduleIdle(timeoutMs: number, task: () => void): PredictionScheduledTask {
    return this.#add(this.#idle, this.#now + timeoutMs, task);
  }

  advanceBy(durationMs: number): void {
    this.#now += durationMs;
    this.#drainTimers();
  }

  runIdle(): void {
    const task = this.#idle.find((entry) => !entry.cancelled);
    if (!task) return;
    task.cancelled = true;
    task.run();
  }

  #add(tasks: Task[], at: number, run: () => void): PredictionScheduledTask {
    const task = { at, cancelled: false, run };
    tasks.push(task);
    return { cancel: () => (task.cancelled = true) };
  }

  #drainTimers(): void {
    while (true) {
      const task = this.#timers
        .filter((entry) => !entry.cancelled && entry.at <= this.#now)
        .sort((left, right) => left.at - right.at)[0];
      if (!task) return;
      task.cancelled = true;
      task.run();
    }
  }
}

interface Task {
  at: number;
  cancelled: boolean;
  run: () => void;
}
