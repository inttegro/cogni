import type { PredictionCandidate } from "@inttegro/cogni-client";
import { PredictionScheduler } from "@inttegro/cogni-client";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { StrictMode, useEffect, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CogniProvider,
  useCogniScheduler,
  useIntentPrefetch,
  useRouteIntent,
  useScheduledPrediction,
} from "../src/index";

const candidate: PredictionCandidate = {
  key: "route:/orders",
  policy: "test-route",
  trigger: "test",
  destination: "/orders",
  probability: 0.95,
  horizonMs: 10_000,
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("CogniProvider", () => {
  it("exposes a supplied scheduler and mirrors foreground activity", () => {
    const scheduler = new PredictionScheduler({ environmentAllowed: false });
    let observed: PredictionScheduler | null = null;

    function Probe() {
      const current = useCogniScheduler();
      useEffect(() => {
        observed = current;
      }, [current]);
      return null;
    }

    const view = render(
      <CogniProvider
        scheduler={scheduler}
        foregroundActivity={1}
        observeBrowserEnvironment={false}
      >
        <Probe />
      </CogniProvider>,
    );

    expect(observed).toBe(scheduler);
    expect(scheduler.foregroundActivity).toBe(1);

    view.rerender(
      <CogniProvider
        scheduler={scheduler}
        foregroundActivity={3}
        observeBrowserEnvironment={false}
      >
        <Probe />
      </CogniProvider>,
    );
    expect(scheduler.foregroundActivity).toBe(3);
  });

  it("does not dispose a supplied scheduler", async () => {
    const scheduler = new PredictionScheduler({ environmentAllowed: false });
    const view = render(
      <CogniProvider scheduler={scheduler} observeBrowserEnvironment={false} />,
    );

    view.unmount();
    await act(async () => {
      await Promise.resolve();
    });

    expect(scheduler.schedule(candidate, async () => undefined).status).toBe("pending");
    scheduler.dispose();
  });

  it("disposes an owned scheduler after unmount", async () => {
    const observed: { current: PredictionScheduler | null } = { current: null };

    function Probe() {
      observed.current = useCogniScheduler();
      return null;
    }

    const view = render(
      <CogniProvider observeBrowserEnvironment={false}>
        <Probe />
      </CogniProvider>,
    );
    const scheduler = observed.current;
    expect(scheduler).not.toBeNull();

    view.unmount();
    await act(async () => {
      await Promise.resolve();
    });

    expect(scheduler?.schedule(candidate, async () => undefined).status).toBe(
      "cancelled",
    );
  });

  it("survives React Strict Mode's development effect replay", async () => {
    const observed: { current: PredictionScheduler | null } = { current: null };

    function Probe() {
      observed.current = useCogniScheduler();
      return null;
    }

    render(
      <StrictMode>
        <CogniProvider observeBrowserEnvironment={false}>
          <Probe />
        </CogniProvider>
      </StrictMode>,
    );
    await act(async () => {
      await Promise.resolve();
    });

    const scheduled = observed.current?.schedule(candidate, async () => undefined, {
      idle: false,
    });
    expect(scheduled?.status).toBe("started");
    expect((await scheduled?.started)?.accepted).toBe(true);
  });
});

describe("React hooks", () => {
  it("schedules and cancels a prediction with component lifecycle", () => {
    vi.useFakeTimers();
    const scheduler = new PredictionScheduler();
    const loader = vi.fn(async () => undefined);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <CogniProvider scheduler={scheduler} observeBrowserEnvironment={false}>
        {children}
      </CogniProvider>
    );

    const hook = renderHook(
      () =>
        useScheduledPrediction(candidate, loader, {
          delayMs: 50,
          idle: false,
        }),
      { wrapper },
    );

    expect(hook.result.current?.status).toBe("pending");
    act(() => vi.advanceTimersByTime(49));
    expect(loader).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(loader).toHaveBeenCalledOnce();

    hook.unmount();
  });

  it("delays hover intent and escalates committed intent", () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const hook = renderHook(() =>
      useIntentPrefetch(run, {
        delayMs: 120,
      }),
    );

    act(() => hook.result.current.schedule("hover"));
    act(() => vi.advanceTimersByTime(119));
    expect(run).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(run).toHaveBeenLastCalledWith("hover");

    act(() => hook.result.current.schedule("stale"));
    act(() => hook.result.current.runNow("click"));
    expect(run).toHaveBeenLastCalledWith("click");
    act(() => vi.runAllTimers());
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("runs router work through the scheduler and records confirmed reuse", async () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const scheduler = new PredictionScheduler({
      coordinatorOptions: {
        onEvent: (event) => events.push(event.type),
      },
    });
    const prefetchRoute = vi.fn(async () => ({ bytes: 512 }));
    const wrapper = ({ children }: { children: ReactNode }) => (
      <CogniProvider scheduler={scheduler} observeBrowserEnvironment={false}>
        {children}
      </CogniProvider>
    );

    const hook = renderHook(
      () =>
        useRouteIntent({
          href: "/products",
          probability: 0.92,
          horizonMs: 10_000,
          hoverDelayMs: 80,
          prefetchRoute,
        }),
      { wrapper },
    );

    act(() => hook.result.current.scheduleHover());
    act(() => vi.advanceTimersByTime(79));
    expect(prefetchRoute).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(prefetchRoute).toHaveBeenCalledWith("/products", {
      signal: expect.any(AbortSignal),
    });

    await act(async () => {
      await Promise.resolve();
      hook.result.current.commit();
      await Promise.resolve();
    });

    expect(events).toContain("loaded");
    expect(events).toContain("reused");
    expect(scheduler.coordinator.quality()).toMatchObject({
      materialOutcomes: 1,
      reused: 1,
      reuseRate: 1,
    });
  });
});
