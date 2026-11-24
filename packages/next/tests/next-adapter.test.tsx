import { PredictionScheduler, type PredictionEvent } from "@inttegro/cogni-client";
import { CogniProvider } from "@inttegro/cogni-react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PredictiveLink,
  useNextDelegatedRouteIntent,
  useNextRoutePrediction,
  type DelegatedRouteIntentActions,
} from "../src/index";

const nextMocks = vi.hoisted(() => ({
  prefetch: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ prefetch: nextMocks.prefetch }),
}));

vi.mock("next/link", () => ({
  default: forwardRef<
    HTMLAnchorElement,
    AnchorHTMLAttributes<HTMLAnchorElement> & {
      href: string;
      prefetch?: boolean | null;
      onNavigate?: (event: { preventDefault: () => void }) => void;
    }
  >(function MockLink(
    { href, prefetch: _prefetch, onNavigate, onClick, ...props },
    ref,
  ) {
    return (
      <a
        {...props}
        ref={ref}
        href={href}
        onClick={(event) => {
          onClick?.(event);
          if (
            !event.defaultPrevented &&
            event.button === 0 &&
            !event.metaKey &&
            !event.ctrlKey &&
            !event.shiftKey &&
            !event.altKey
          ) {
            onNavigate?.({ preventDefault: () => event.preventDefault() });
          }
        }}
      />
    );
  }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  nextMocks.prefetch.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function provider(scheduler: PredictionScheduler) {
  return function Provider({ children }: { children: ReactNode }) {
    return (
      <CogniProvider scheduler={scheduler} observeBrowserEnvironment={false}>
        {children}
      </CogniProvider>
    );
  };
}

describe("PredictiveLink", () => {
  it("waits for sustained hover before prefetching", () => {
    const scheduler = new PredictionScheduler();
    render(
      <PredictiveLink href="/orders" probability={0.92} horizonMs={30_000}>
        Orders
      </PredictiveLink>,
      { wrapper: provider(scheduler) },
    );

    fireEvent.pointerEnter(screen.getByRole("link", { name: "Orders" }));
    act(() => vi.advanceTimersByTime(119));
    expect(nextMocks.prefetch).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(nextMocks.prefetch).toHaveBeenCalledWith(
      "/orders",
      expect.objectContaining({ onInvalidate: expect.any(Function) }),
    );
  });

  it("cancels hover work when the pointer leaves", () => {
    const scheduler = new PredictionScheduler();
    render(
      <PredictiveLink href="/orders" probability={0.92} horizonMs={30_000}>
        Orders
      </PredictiveLink>,
      { wrapper: provider(scheduler) },
    );

    const link = screen.getByRole("link", { name: "Orders" });
    fireEvent.pointerEnter(link);
    fireEvent.pointerLeave(link);
    act(() => vi.runAllTimers());
    expect(nextMocks.prefetch).not.toHaveBeenCalled();
  });

  it("escalates direct intent and records reuse on committed navigation", async () => {
    const events: PredictionEvent[] = [];
    const scheduler = new PredictionScheduler({
      coordinatorOptions: {
        onEvent: (event) => events.push(event),
      },
    });
    render(
      <PredictiveLink href="/orders" probability={0.92} horizonMs={30_000}>
        Orders
      </PredictiveLink>,
      { wrapper: provider(scheduler) },
    );

    const link = screen.getByRole("link", { name: "Orders" });
    fireEvent.pointerDown(link);
    expect(nextMocks.prefetch).toHaveBeenCalledOnce();
    fireEvent.click(link);
    await act(async () => {
      await Promise.resolve();
    });

    expect(events.some((event) => event.type === "reused")).toBe(true);
  });

  it("does not report reuse for a modified click", async () => {
    const events: PredictionEvent[] = [];
    const scheduler = new PredictionScheduler({
      coordinatorOptions: {
        onEvent: (event) => events.push(event),
      },
    });
    render(
      <PredictiveLink href="/orders" probability={0.92} horizonMs={30_000}>
        Orders
      </PredictiveLink>,
      { wrapper: provider(scheduler) },
    );

    const link = screen.getByRole("link", { name: "Orders" });
    fireEvent.pointerDown(link);
    fireEvent.click(link, { metaKey: true });
    await act(async () => {
      await Promise.resolve();
    });

    expect(events.some((event) => event.type === "reused")).toBe(false);
  });

  it("does not report reuse when navigation is prevented", async () => {
    const events: PredictionEvent[] = [];
    const scheduler = new PredictionScheduler({
      coordinatorOptions: {
        onEvent: (event) => events.push(event),
      },
    });
    render(
      <PredictiveLink
        href="/orders"
        probability={0.92}
        horizonMs={30_000}
        onNavigate={(event) => event.preventDefault()}
      >
        Orders
      </PredictiveLink>,
      { wrapper: provider(scheduler) },
    );

    fireEvent.click(screen.getByRole("link", { name: "Orders" }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(events.some((event) => event.type === "reused")).toBe(false);
  });
});

describe("useNextRoutePrediction", () => {
  it("uses an injected full-route prefetch without changing scheduler behavior", () => {
    const scheduler = new PredictionScheduler();
    const prefetchRoute = vi.fn(async () => ({ bytes: 512 }));

    renderHook(
      () =>
        useNextRoutePrediction({
          href: "/orders/123",
          trigger: "account-policy",
          probability: 0.95,
          horizonMs: 15_000,
          prefetchRoute,
          schedule: { idle: false },
        }),
      { wrapper: provider(scheduler) },
    );

    expect(prefetchRoute).toHaveBeenCalledWith(
      "/orders/123",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        onInvalidate: expect.any(Function),
      }),
    );
    expect(nextMocks.prefetch).not.toHaveBeenCalled();
  });
});

describe("useNextDelegatedRouteIntent", () => {
  it("discovers ordinary rendered links through the App Router adapter", async () => {
    const events: PredictionEvent[] = [];
    const scheduler = new PredictionScheduler({
      coordinatorOptions: {
        onEvent: (event) => events.push(event),
      },
    });
    const actions: { current: DelegatedRouteIntentActions | null } = { current: null };

    function Observer() {
      actions.current = useNextDelegatedRouteIntent({
        probability: 0.94,
        horizonMs: 15_000,
      });
      return null;
    }

    render(
      <CogniProvider scheduler={scheduler} observeBrowserEnvironment={false}>
        <Observer />
        <a href="/orders">
          <span>Orders</span>
        </a>
      </CogniProvider>,
    );

    fireEvent.focusIn(screen.getByText("Orders"));
    expect(nextMocks.prefetch).toHaveBeenCalledWith(
      "/orders",
      expect.objectContaining({ onInvalidate: expect.any(Function) }),
    );
    expect(events.some((event) => event.candidate.key === "next-route:/orders")).toBe(
      true,
    );

    await act(async () => {
      expect(await actions.current?.markReused("/orders")).toBe(true);
      await Promise.resolve();
    });
    expect(events.some((event) => event.type === "reused")).toBe(true);
  });

  it("forwards an injected full-route prefetch for discovered links", () => {
    const scheduler = new PredictionScheduler();
    const prefetchRoute = vi.fn(async () => ({ bytes: 1024 }));

    function Observer() {
      useNextDelegatedRouteIntent({
        probability: 0.94,
        horizonMs: 15_000,
        prefetchRoute,
      });
      return null;
    }

    render(
      <CogniProvider scheduler={scheduler} observeBrowserEnvironment={false}>
        <Observer />
        <a href="/customers/cus_123">Customer</a>
      </CogniProvider>,
    );

    fireEvent.pointerDown(screen.getByRole("link", { name: "Customer" }));
    expect(prefetchRoute).toHaveBeenCalledWith(
      "/customers/cus_123",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        onInvalidate: expect.any(Function),
      }),
    );
  });
});
