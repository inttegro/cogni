import { describe, expect, it, vi } from "vitest";

import { IntentPrefetchController } from "../src";
import type { PredictionRuntime, PredictionScheduledTask } from "../src";

describe("IntentPrefetchController", () => {
  it("delays hover-like intent and cancels when intent leaves", () => {
    const runtime = new ManualRuntime();
    const run = vi.fn();
    const controller = new IntentPrefetchController({
      run,
      delayMs: 50,
      runtime,
    });

    controller.schedule("/products");
    runtime.advanceBy(49);
    expect(run).not.toHaveBeenCalled();
    controller.cancel();
    runtime.advanceBy(1);
    expect(run).not.toHaveBeenCalled();
  });

  it("escalates pointer, focus, touch, or click intent immediately", () => {
    const runtime = new ManualRuntime();
    const run = vi.fn();
    const controller = new IntentPrefetchController({ run, runtime });

    controller.schedule("/old");
    controller.runNow("/committed");
    runtime.advanceBy(1_000);

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith("/committed");
  });
});

class ManualRuntime implements PredictionRuntime {
  #now = 0;
  readonly #tasks: Task[] = [];

  now(): number {
    return this.#now;
  }

  schedule(delayMs: number, run: () => void): PredictionScheduledTask {
    const task = { at: this.#now + delayMs, cancelled: false, run };
    this.#tasks.push(task);
    return { cancel: () => (task.cancelled = true) };
  }

  advanceBy(durationMs: number): void {
    this.#now += durationMs;
    for (const task of this.#tasks) {
      if (!task.cancelled && task.at <= this.#now) {
        task.cancelled = true;
        task.run();
      }
    }
  }
}

interface Task {
  at: number;
  cancelled: boolean;
  run: () => void;
}
