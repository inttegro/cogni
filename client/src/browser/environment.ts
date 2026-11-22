export interface BrowserConnection {
  readonly effectiveType?: string;
  readonly saveData?: boolean;
}

export interface ObservableBrowserConnection extends BrowserConnection {
  addEventListener?(type: "change", listener: () => void): void;
  removeEventListener?(type: "change", listener: () => void): void;
}

export interface BrowserPredictionEnvironment {
  readonly document?: {
    readonly visibilityState?: string;
  };
  readonly navigator?: {
    readonly connection?: BrowserConnection;
  };
}

export interface ObservableBrowserPredictionEnvironment {
  readonly document: {
    readonly visibilityState?: string;
    addEventListener(type: "visibilitychange", listener: () => void): void;
    removeEventListener(type: "visibilitychange", listener: () => void): void;
  };
  readonly navigator: {
    readonly connection?: ObservableBrowserConnection;
  };
}

export type BrowserPredictionBlockReason =
  "browser_unavailable" | "document_hidden" | "save_data" | "slow_connection";

export type BrowserPredictionDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly reason: BrowserPredictionBlockReason;
    };

/**
 * Applies the conservative browser constraints used before scheduling
 * speculative work. Pass an explicit environment for deterministic tests.
 */
export function evaluateBrowserPredictionEnvironment(
  environment: BrowserPredictionEnvironment = currentBrowserEnvironment(),
): BrowserPredictionDecision {
  if (!environment.document || !environment.navigator) {
    return { allowed: false, reason: "browser_unavailable" };
  }
  if (environment.document.visibilityState !== "visible") {
    return { allowed: false, reason: "document_hidden" };
  }

  const connection = environment.navigator.connection;
  if (connection?.saveData) {
    return { allowed: false, reason: "save_data" };
  }
  if (connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g") {
    return { allowed: false, reason: "slow_connection" };
  }
  return { allowed: true };
}

export function browserAllowsPrediction(
  environment?: BrowserPredictionEnvironment,
): boolean {
  return evaluateBrowserPredictionEnvironment(environment).allowed;
}

/**
 * Observes the browser signals that can change prediction admission. The
 * callback runs immediately and after visibility or connection changes.
 */
export function observeBrowserPredictionEnvironment(
  listener: (decision: BrowserPredictionDecision) => void,
  environment: ObservableBrowserPredictionEnvironment = currentObservableBrowserEnvironment(),
): () => void {
  const notify = () => listener(evaluateBrowserPredictionEnvironment(environment));
  const connection = environment.navigator.connection;

  environment.document.addEventListener("visibilitychange", notify);
  connection?.addEventListener?.("change", notify);
  notify();

  return () => {
    environment.document.removeEventListener("visibilitychange", notify);
    connection?.removeEventListener?.("change", notify);
  };
}

function currentBrowserEnvironment(): BrowserPredictionEnvironment {
  return {
    document: globalThis.document,
    navigator: globalThis.navigator as NonNullable<
      BrowserPredictionEnvironment["navigator"]
    >,
  };
}

function currentObservableBrowserEnvironment(): ObservableBrowserPredictionEnvironment {
  if (!globalThis.document || !globalThis.navigator) {
    throw new TypeError("an observable browser environment is required");
  }
  return {
    document: globalThis.document,
    navigator: globalThis.navigator as NonNullable<
      ObservableBrowserPredictionEnvironment["navigator"]
    >,
  };
}
