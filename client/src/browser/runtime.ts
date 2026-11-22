import type {
  PredictionScheduledTask,
  PredictionSchedulerRuntime,
} from "../core/types";

export interface BrowserSchedulerHost {
  readonly setTimeout: typeof globalThis.setTimeout;
  readonly clearTimeout: typeof globalThis.clearTimeout;
  readonly requestIdleCallback?: (
    callback: () => void,
    options?: { timeout: number },
  ) => number;
  readonly cancelIdleCallback?: (handle: number) => void;
}

/** Uses requestIdleCallback when available and a timer fallback everywhere else. */
export function createBrowserPredictionSchedulerRuntime(
  host: BrowserSchedulerHost = globalThis,
): PredictionSchedulerRuntime {
  return {
    now: () => Date.now(),
    schedule(delayMs, task) {
      const handle = host.setTimeout(task, delayMs);
      return { cancel: () => host.clearTimeout(handle) };
    },
    scheduleIdle(timeoutMs, task): PredictionScheduledTask {
      if (host.requestIdleCallback && host.cancelIdleCallback) {
        const handle = host.requestIdleCallback(task, { timeout: timeoutMs });
        return { cancel: () => host.cancelIdleCallback?.(handle) };
      }
      const handle = host.setTimeout(task, 0);
      return { cancel: () => host.clearTimeout(handle) };
    },
  };
}
