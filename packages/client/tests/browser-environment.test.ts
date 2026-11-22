import { describe, expect, it } from "vitest";

import {
  browserAllowsPrediction,
  evaluateBrowserPredictionEnvironment,
  observeBrowserPredictionEnvironment,
  type BrowserPredictionEnvironment,
} from "../src/browser";

function environment(
  overrides: {
    visibilityState?: string;
    effectiveType?: string;
    saveData?: boolean;
  } = {},
): BrowserPredictionEnvironment {
  return {
    document: { visibilityState: overrides.visibilityState ?? "visible" },
    navigator: {
      connection: {
        ...(overrides.effectiveType === undefined
          ? {}
          : { effectiveType: overrides.effectiveType }),
        ...(overrides.saveData === undefined ? {} : { saveData: overrides.saveData }),
      },
    },
  };
}

describe("browser prediction environment", () => {
  it("allows visible browsers on ordinary connections", () => {
    expect(browserAllowsPrediction(environment({ effectiveType: "4g" }))).toBe(true);
  });

  it("blocks prediction outside a browser", () => {
    expect(evaluateBrowserPredictionEnvironment({})).toEqual({
      allowed: false,
      reason: "browser_unavailable",
    });
  });

  it("blocks prediction while the document is hidden", () => {
    expect(
      evaluateBrowserPredictionEnvironment(environment({ visibilityState: "hidden" })),
    ).toEqual({ allowed: false, reason: "document_hidden" });
  });

  it("honors the user's reduced-data preference", () => {
    expect(
      evaluateBrowserPredictionEnvironment(environment({ saveData: true })),
    ).toEqual({ allowed: false, reason: "save_data" });
  });

  it.each(["slow-2g", "2g"])("blocks prediction on %s connections", (effectiveType) => {
    expect(
      evaluateBrowserPredictionEnvironment(environment({ effectiveType })),
    ).toEqual({ allowed: false, reason: "slow_connection" });
  });

  it("observes visibility and connection changes", () => {
    const document = new ObservableDocument();
    const connection = new ObservableConnection();
    const decisions: boolean[] = [];
    const stop = observeBrowserPredictionEnvironment(
      (decision) => decisions.push(decision.allowed),
      { document, navigator: { connection } },
    );

    document.visibilityState = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    document.visibilityState = "visible";
    connection.saveData = true;
    connection.dispatchEvent(new Event("change"));
    stop();
    connection.saveData = false;
    connection.dispatchEvent(new Event("change"));

    expect(decisions).toEqual([true, false, false]);
  });
});

class ObservableDocument extends EventTarget {
  visibilityState = "visible";
}

class ObservableConnection extends EventTarget {
  effectiveType = "4g";
  saveData = false;
}
