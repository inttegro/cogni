import type { PredictionRuntime, PredictionScheduledTask } from "./types";

const SYSTEM_RUNTIME: PredictionRuntime = {
  now: () => Date.now(),
  schedule(delayMs, task) {
    const timer = setTimeout(task, delayMs);
    return { cancel: () => clearTimeout(timer) };
  },
};

export interface IntentPrefetchControllerOptions<Value> {
  readonly run: (value: Value) => void | Promise<void>;
  readonly delayMs?: number;
  readonly runtime?: PredictionRuntime;
  readonly onError?: (error: unknown) => void;
}

/**
 * Framework-neutral delayed intent controller. React hooks, delegated DOM
 * listeners, and native apps can all use the same schedule/cancel/escalate
 * behavior without Cogni owning their event system.
 */
export class IntentPrefetchController<Value> {
  readonly #run: (value: Value) => void | Promise<void>;
  readonly #delayMs: number;
  readonly #runtime: PredictionRuntime;
  readonly #onError: ((error: unknown) => void) | undefined;
  #task: PredictionScheduledTask | null = null;
  #disposed = false;

  constructor(options: IntentPrefetchControllerOptions<Value>) {
    if (typeof options?.run !== "function") {
      throw new TypeError("run must be a function");
    }
    this.#run = options.run;
    this.#delayMs = nonNegativeFinite(options.delayMs ?? 120, "delayMs");
    this.#runtime = options.runtime ?? SYSTEM_RUNTIME;
    this.#onError = options.onError;
  }

  schedule(value: Value): void {
    if (this.#disposed) return;
    this.cancel();
    this.#task = this.#runtime.schedule(this.#delayMs, () => {
      this.#task = null;
      this.#execute(value);
    });
  }

  runNow(value: Value): void {
    if (this.#disposed) return;
    this.cancel();
    this.#execute(value);
  }

  cancel(): void {
    this.#task?.cancel();
    this.#task = null;
  }

  dispose(): void {
    this.#disposed = true;
    this.cancel();
  }

  #execute(value: Value): void {
    try {
      void Promise.resolve(this.#run(value)).catch((error: unknown) => {
        this.#reportError(error);
      });
    } catch (error) {
      this.#reportError(error);
    }
  }

  #reportError(error: unknown): void {
    try {
      this.#onError?.(error);
    } catch {
      // Observability must never interfere with committed user intent.
    }
  }
}

function nonNegativeFinite(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative finite number`);
  }
  return value;
}
