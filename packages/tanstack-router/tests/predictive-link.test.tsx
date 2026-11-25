import { PredictionScheduler } from "@inttegro/cogni-client";
import { CogniProvider } from "@inttegro/cogni-react";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PredictiveLink } from "../src/index";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("TanStack Router PredictiveLink", () => {
  it("uses preloadRoute and records reuse only after navigation begins", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("scrollTo", vi.fn());
    const events: string[] = [];
    const scheduler = new PredictionScheduler({
      coordinatorOptions: {
        onEvent: (event) => events.push(event.type),
      },
    });

    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const homeRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: () => (
        <PredictiveLink to="/orders" hoverDelayMs={75}>
          Orders
        </PredictiveLink>
      ),
    });
    const ordersRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/orders",
      loader: async () => ({ count: 2 }),
      component: () => <h1>Orders page</h1>,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([homeRoute, ordersRoute]),
      history: createMemoryHistory({ initialEntries: ["/"] }),
      defaultPreload: false,
    });
    const preloadRoute = vi.spyOn(router, "preloadRoute");

    render(
      <CogniProvider scheduler={scheduler} observeBrowserEnvironment={false}>
        <RouterProvider router={router} />
      </CogniProvider>,
    );
    await act(async () => {
      await router.load();
    });

    fireEvent.mouseEnter(screen.getByRole("link", { name: "Orders" }));
    act(() => vi.advanceTimersByTime(75));
    expect(preloadRoute).toHaveBeenCalledWith({ to: "/orders" });
    expect(events).not.toContain("reused");

    fireEvent.click(screen.getByRole("link", { name: "Orders" }));
    await act(async () => {
      await router.load();
    });

    expect(screen.getByRole("heading", { name: "Orders page" })).toBeTruthy();
    expect(events).toContain("reused");
    expect(scheduler.coordinator.quality()).toMatchObject({
      materialOutcomes: 1,
      reused: 1,
      reuseRate: 1,
    });
  });
});
