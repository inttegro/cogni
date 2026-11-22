import { PredictionScheduler } from "@inttegro/cogni-client";
import { CogniProvider } from "@inttegro/cogni-react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { LinkHTMLAttributes } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PredictiveLink } from "../src/index";

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    PrefetchPageLinks: ({
      page,
      ...props
    }: { readonly page: string } & LinkHTMLAttributes<HTMLLinkElement>) => (
      <link {...props} rel="prefetch" href={`/__cogni-prefetch${page}`} />
    ),
  };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("React Router PredictiveLink", () => {
  it("activates Framework Mode resources only after Cogni admits the route", async () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const scheduler = new PredictionScheduler({
      coordinatorOptions: {
        onEvent: (event) => events.push(event.type),
      },
    });

    render(
      <CogniProvider scheduler={scheduler} observeBrowserEnvironment={false}>
        <MemoryRouter initialEntries={["/"]}>
          <PredictiveLink
            to="/orders"
            probability={0.94}
            horizonMs={10_000}
            hoverDelayMs={75}
          >
            Orders
          </PredictiveLink>
        </MemoryRouter>
      </CogniProvider>,
    );

    fireEvent.pointerEnter(screen.getByRole("link", { name: "Orders" }));
    act(() => vi.advanceTimersByTime(74));
    expect(document.querySelector("link[data-cogni-prefetch]")).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    const resource = document.querySelector<HTMLLinkElement>(
      "link[data-cogni-prefetch]",
    );
    expect(resource?.getAttribute("href")).toBe("/__cogni-prefetch/orders");

    fireEvent.load(resource!);
    await act(async () => {
      vi.advanceTimersByTime(100);
      await Promise.resolve();
    });

    expect(events).toContain("loaded");
  });

  it("prefetches through Cogni and records reuse after the destination commits", async () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const scheduler = new PredictionScheduler({
      coordinatorOptions: {
        onEvent: (event) => events.push(event.type),
      },
    });
    const prefetchRoute = vi.fn(async () => ({ bytes: 1_024 }));

    render(
      <CogniProvider scheduler={scheduler} observeBrowserEnvironment={false}>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route
              path="/"
              element={
                <PredictiveLink
                  to="/orders"
                  probability={0.94}
                  horizonMs={10_000}
                  hoverDelayMs={75}
                  prefetchRoute={prefetchRoute}
                >
                  Orders
                </PredictiveLink>
              }
            />
            <Route path="/orders" element={<h1>Orders page</h1>} />
          </Routes>
        </MemoryRouter>
      </CogniProvider>,
    );

    fireEvent.pointerEnter(screen.getByRole("link", { name: "Orders" }));
    act(() => vi.advanceTimersByTime(75));
    expect(prefetchRoute).toHaveBeenCalledWith("/orders", {
      signal: expect.any(AbortSignal),
    });
    expect(events).not.toContain("reused");

    fireEvent.click(screen.getByRole("link", { name: "Orders" }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole("heading", { name: "Orders page" })).toBeTruthy();
    expect(events).toContain("reused");
    expect(scheduler.coordinator.quality()).toMatchObject({
      materialOutcomes: 1,
      reused: 1,
      reuseRate: 1,
    });
  });

  it("honors a consumer that prevents navigation", () => {
    const scheduler = new PredictionScheduler();
    const prefetchRoute = vi.fn(async () => undefined);

    render(
      <CogniProvider scheduler={scheduler} observeBrowserEnvironment={false}>
        <MemoryRouter initialEntries={["/"]}>
          <PredictiveLink
            to="/orders"
            probability={0.94}
            horizonMs={10_000}
            prefetchRoute={prefetchRoute}
            onClick={(event) => event.preventDefault()}
          >
            Orders
          </PredictiveLink>
        </MemoryRouter>
      </CogniProvider>,
    );

    fireEvent.click(screen.getByRole("link", { name: "Orders" }));
    expect(prefetchRoute).not.toHaveBeenCalled();
  });
});
