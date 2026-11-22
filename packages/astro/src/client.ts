import { prefetch } from "astro:prefetch";
import {
  createAstroPredictionRuntime,
  type AstroPredictionRuntime,
  type AstroPredictionRuntimeOptions,
} from "./runtime";

const RUNTIME_KEY = "__inttegroCogniAstroRuntime";

type ClientOptions = Omit<AstroPredictionRuntimeOptions, "prefetchRoute">;

interface CogniAstroGlobal {
  [RUNTIME_KEY]?: AstroPredictionRuntime;
}

/** Install one delegated runtime for the Astro document. Safe across layout reuse. */
export function installAstroPredictionRuntime(
  options: ClientOptions = {},
): AstroPredictionRuntime {
  const host = globalThis as typeof globalThis & CogniAstroGlobal;
  const current = host[RUNTIME_KEY];
  if (current) return current.start();

  const runtime = createAstroPredictionRuntime({
    ...options,
    prefetchRoute(href) {
      prefetch(href);
    },
  });
  host[RUNTIME_KEY] = runtime;
  return runtime.start();
}

export function uninstallAstroPredictionRuntime(): void {
  const host = globalThis as typeof globalThis & CogniAstroGlobal;
  host[RUNTIME_KEY]?.dispose();
  delete host[RUNTIME_KEY];
}
