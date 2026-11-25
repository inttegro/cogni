import { describe, expect, it, vi } from "vitest";

import {
  CogniDevtoolsSnapshotStore,
  COGNI_DEVTOOLS_PROTOCOL,
  emptyCogniDevtoolsSnapshot,
  executeCogniDevtoolsCommand,
  installCogniDevtoolsBridge,
  mountCogniDevtoolsPanel,
} from "../src";

describe("Cogni DevTools browser surfaces", () => {
  it("bridges snapshots and responds to snapshot requests", () => {
    const store = new CogniDevtoolsSnapshotStore();
    const postMessage = vi.spyOn(window, "postMessage");
    const dispose = installCogniDevtoolsBridge(store, { target: window });

    window.dispatchEvent(
      new MessageEvent("message", {
        source: window,
        data: {
          protocol: COGNI_DEVTOOLS_PROTOCOL,
          direction: "devtools-to-cogni",
          type: "request_snapshot",
        },
      }),
    );

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "snapshot" }),
      window.location.origin,
    );
    dispose();
  });

  it("highlights anchors that resolve to a predicted destination", () => {
    document.body.innerHTML =
      '<a href="/orders">Orders</a><a href="/products">Products</a>';
    const matches = executeCogniDevtoolsCommand(
      { type: "highlight", destination: "/orders" },
      { document, durationMs: 1_000 },
    );

    expect(matches).toBe(1);
    expect(
      document
        .querySelector('a[href="/orders"]')
        ?.getAttribute("data-cogni-devtools-target"),
    ).toBe("");
  });

  it("renders the shared panel from a remote snapshot store", () => {
    const store = new CogniDevtoolsSnapshotStore({
      ...emptyCogniDevtoolsSnapshot(),
      environmentAllowed: false,
      foregroundActivity: 2,
    });
    const root = document.createElement("div");
    document.body.append(root);
    const panel = mountCogniDevtoolsPanel(root, { store, mode: "extension" });

    expect(root.shadowRoot?.textContent).toContain("Environment blocked");
    expect(root.shadowRoot?.textContent).toContain("2 foreground requests");
    expect(root.shadowRoot?.textContent).toContain("Prediction activity");
    expect(
      root.shadowRoot?.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
    ).toBe("Overview");
    panel.destroy();
  });

  it("explains learned confidence separately from the host probability", () => {
    const store = new CogniDevtoolsSnapshotStore({
      ...emptyCogniDevtoolsSnapshot(),
      traces: [
        {
          id: "orders:1",
          attempt: 1,
          candidate: {
            key: "orders",
            policy: "navigation",
            trigger: "idle",
            destination: "/orders",
            probability: 0.74,
            horizonMs: 5_000,
            calibration: {
              model: "adaptive-transition-v1",
              baseProbability: 0.62,
              personalizedProbability: 0.78,
              evidence: 8,
              confidence: 0.75,
              adjustment: 0.12,
            },
          },
          state: "reused",
          firstAt: 0,
          lastAt: 100,
          materialWork: true,
          bytes: 1_000,
        },
      ],
    });
    const root = document.createElement("div");
    document.body.append(root);
    const panel = mountCogniDevtoolsPanel(root, { store, mode: "extension" });
    const predictions = [...(root.shadowRoot?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent === "Predictions",
    );
    predictions?.click();

    expect(root.shadowRoot?.textContent).toContain("74% final");
    expect(root.shadowRoot?.textContent).toContain("62% base · 8 observations");
    panel.destroy();
  });
});
