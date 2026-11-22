"use client";

import {
  PredictionScheduler,
  type PredictionScheduler as PredictionSchedulerInstance,
} from "@inttegro/cogni-client";
import {
  createBrowserPredictionSchedulerRuntime,
  observeBrowserPredictionEnvironment,
} from "@inttegro/cogni-client/browser";
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";

export interface CogniProviderProps {
  readonly children?: ReactNode;
  /** A host-owned scheduler. Cogni never disposes a scheduler supplied here. */
  readonly scheduler?: PredictionSchedulerInstance;
  /** Creates a provider-owned scheduler when the default browser runtime is unsuitable. */
  readonly createScheduler?: () => PredictionSchedulerInstance;
  /** Mirrors the host's active foreground request count into the scheduler. */
  readonly foregroundActivity?: number;
  /** Observe visibility, data-saver, and constrained-network signals. */
  readonly observeBrowserEnvironment?: boolean;
}

interface ProviderState {
  readonly scheduler: PredictionSchedulerInstance;
  readonly suppliedScheduler: PredictionSchedulerInstance | undefined;
  readonly ownsScheduler: boolean;
  mounts: number;
  disposalGeneration: number;
}

const CogniSchedulerContext = createContext<PredictionSchedulerInstance | null>(null);

export function CogniProvider({
  children,
  scheduler,
  createScheduler,
  foregroundActivity,
  observeBrowserEnvironment = true,
}: CogniProviderProps) {
  const stateRef = useRef<ProviderState | null>(null);

  if (stateRef.current === null) {
    if (scheduler && createScheduler) {
      throw new TypeError("scheduler and createScheduler are mutually exclusive");
    }

    stateRef.current = {
      scheduler:
        scheduler ??
        createScheduler?.() ??
        new PredictionScheduler({
          runtime: createBrowserPredictionSchedulerRuntime(),
          environmentAllowed: !observeBrowserEnvironment,
        }),
      suppliedScheduler: scheduler,
      ownsScheduler: scheduler === undefined,
      mounts: 0,
      disposalGeneration: 0,
    };
  }

  const state = stateRef.current;
  if (state.suppliedScheduler !== scheduler) {
    throw new TypeError("CogniProvider scheduler cannot change after mounting");
  }

  useEffect(() => {
    if (!observeBrowserEnvironment) return undefined;

    try {
      return observeBrowserPredictionEnvironment((decision) => {
        state.scheduler.setEnvironmentAllowed(decision.allowed);
      });
    } catch {
      state.scheduler.setEnvironmentAllowed(false);
      return undefined;
    }
  }, [observeBrowserEnvironment, state]);

  useEffect(() => {
    if (foregroundActivity !== undefined) {
      state.scheduler.setForegroundActivity(foregroundActivity);
    }
  }, [foregroundActivity, state]);

  useEffect(() => {
    state.mounts += 1;
    state.disposalGeneration += 1;

    return () => {
      state.mounts -= 1;
      const generation = ++state.disposalGeneration;

      queueMicrotask(() => {
        if (
          state.ownsScheduler &&
          state.mounts === 0 &&
          state.disposalGeneration === generation
        ) {
          state.scheduler.dispose();
        }
      });
    };
  }, [state]);

  return (
    <CogniSchedulerContext.Provider value={state.scheduler}>
      {children}
    </CogniSchedulerContext.Provider>
  );
}

export function useCogniScheduler(): PredictionSchedulerInstance {
  const scheduler = useContext(CogniSchedulerContext);
  if (!scheduler) {
    throw new TypeError("useCogniScheduler must be used inside CogniProvider");
  }
  return scheduler;
}
