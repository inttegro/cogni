import { PredictionScheduler, type PredictionEvent } from "@inttegro/cogni-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAstroLinkAttributes,
  createAstroPredictionRuntime,
  createAstroRouteCandidate,
} from "../src/index";

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = "";
  history.replaceState(null, "", "/current");
});

afterEach(() => {
  vi.useRealTimers();
});

function appendLink(overrides: Record<string, string> = {}): HTMLAnchorElement {
  const link = document.createElement("a");
  link.href = "/orders";
  link.textContent = "Orders";
  for (const [name, value] of Object.entries({
    ...createAstroLinkAttributes({}),
    ...overrides,
  })) {
    link.setAttribute(name, value);
  }
  document.body.append(link);
  return link;
}

function dispatchBeforePreparation(to: string): void {
  const event = new Event("astro:before-preparation");
  Object.defineProperty(event, "to", { value: new URL(to, location.href) });
  document.dispatchEvent(event);
}

describe("AstroPredictionRuntime", () => {
  it("waits for sustained delegated hover intent", async () => {
    const prefetchRoute = vi.fn();
    const runtime = createAstroPredictionRuntime({
      opaqueUserKey: "test-user",
      prefetchRoute,
      observeBrowserEnvironment: false,
    }).start();
    const link = appendLink();

    link.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    vi.advanceTimersByTime(119);
    expect(prefetchRoute).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    await vi.waitFor(() =>
      expect(prefetchRoute).toHaveBeenCalledWith(
        "http://localhost:3000/orders",
        expect.objectContaining({
          signal: expect.any(AbortSignal),
          source: link,
        }),
      ),
    );
    runtime.dispose();
  });

  it("cancels hover work when intent leaves", () => {
    const prefetchRoute = vi.fn();
    const runtime = createAstroPredictionRuntime({
      opaqueUserKey: "test-user",
      prefetchRoute,
      observeBrowserEnvironment: false,
    }).start();
    const link = appendLink();

    link.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    link.dispatchEvent(new MouseEvent("pointerout", { bubbles: true }));
    vi.runAllTimers();

    expect(prefetchRoute).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it("starts direct intent immediately and records confirmed Astro navigation reuse", async () => {
    const events: PredictionEvent[] = [];
    const scheduler = new PredictionScheduler({
      coordinatorOptions: {
        onEvent: (event) => events.push(event),
      },
    });
    const prefetchRoute = vi.fn(() => ({ bytes: 512 }));
    const runtime = createAstroPredictionRuntime({
      scheduler,
      prefetchRoute,
      observeBrowserEnvironment: false,
    }).start();
    const link = appendLink();

    link.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
    expect(prefetchRoute).toHaveBeenCalledOnce();

    dispatchBeforePreparation("/orders");
    await Promise.resolve();
    await Promise.resolve();

    expect(events.some((event) => event.type === "reused")).toBe(true);
    document.dispatchEvent(new Event("astro:page-load"));
    expect(scheduler.foregroundActivity).toBe(0);
    runtime.dispose();
    scheduler.dispose();
  });

  it("does not claim reuse without a prior prediction", async () => {
    const events: PredictionEvent[] = [];
    const scheduler = new PredictionScheduler({
      coordinatorOptions: {
        onEvent: (event) => events.push(event),
      },
    });
    const runtime = createAstroPredictionRuntime({
      scheduler,
      prefetchRoute: vi.fn(),
      observeBrowserEnvironment: false,
    }).start();
    appendLink();

    dispatchBeforePreparation("/orders");
    await Promise.resolve();

    expect(events.some((event) => event.type === "reused")).toBe(false);
    expect(scheduler.foregroundActivity).toBe(1);
    runtime.dispose();
    scheduler.dispose();
  });

  it("ignores modified pointer intent and reports invalid attributes without breaking navigation", () => {
    const onError = vi.fn();
    const prefetchRoute = vi.fn();
    const runtime = createAstroPredictionRuntime({
      opaqueUserKey: "test-user",
      prefetchRoute,
      observeBrowserEnvironment: false,
      onError,
    }).start();
    const modified = appendLink();
    const invalid = appendLink({ "data-cogni-probability": "2" });

    modified.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, button: 0, metaKey: true }),
    );
    invalid.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

    expect(prefetchRoute).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.any(TypeError));
    runtime.dispose();
  });
});

describe("Astro route helpers", () => {
  it("creates stable route candidates and opts links out of Astro's parallel prefetcher", () => {
    expect(
      createAstroRouteCandidate(
        "/orders#latest",
        "hover",
        {},
        "https://example.com/home",
      ),
    ).toMatchObject({
      key: "astro-route:https://example.com/orders",
      destination: "https://example.com/orders",
      policy: "astro-route",
      trigger: "hover",
      probability: 0.8,
      horizonMs: 30_000,
    });
    expect(createAstroLinkAttributes({})).toMatchObject({
      "data-astro-prefetch": "false",
      "data-cogni-astro": "",
      "data-cogni-probability": "0.8",
      "data-cogni-horizon-ms": "30000",
    });
  });
});
