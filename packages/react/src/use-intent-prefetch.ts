"use client";

import {
  IntentPrefetchController,
  type PredictionRuntime,
} from "@inttegro/cogni-client";
import { useCallback, useEffect, useRef } from "react";

export interface UseIntentPrefetchOptions {
  readonly delayMs?: number;
  readonly runtime?: PredictionRuntime;
  readonly onError?: (error: unknown) => void;
}

export interface IntentPrefetchActions<Value> {
  schedule(value: Value): void;
  runNow(value: Value): void;
  cancel(): void;
}

/** Delays hover intent while allowing focus, touch, or click to run immediately. */
export function useIntentPrefetch<Value>(
  run: (value: Value) => void | Promise<void>,
  options: UseIntentPrefetchOptions = {},
): IntentPrefetchActions<Value> {
  const controllerRef = useRef<IntentPrefetchController<Value> | null>(null);
  const runRef = useRef(run);
  const onErrorRef = useRef(options.onError);
  runRef.current = run;
  onErrorRef.current = options.onError;

  useEffect(() => {
    const controller = new IntentPrefetchController<Value>({
      run: (value) => runRef.current(value),
      onError: (error) => onErrorRef.current?.(error),
      ...(options.delayMs === undefined ? {} : { delayMs: options.delayMs }),
      ...(options.runtime === undefined ? {} : { runtime: options.runtime }),
    });
    controllerRef.current = controller;

    return () => {
      controller.dispose();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [options.delayMs, options.runtime]);

  const schedule = useCallback((value: Value) => {
    controllerRef.current?.schedule(value);
  }, []);
  const runNow = useCallback((value: Value) => {
    controllerRef.current?.runNow(value);
  }, []);
  const cancel = useCallback(() => {
    controllerRef.current?.cancel();
  }, []);

  return { schedule, runNow, cancel };
}
