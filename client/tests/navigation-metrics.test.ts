import { describe, expect, it, vi } from "vitest";

import { NavigationMetrics } from "../src";

describe("NavigationMetrics", () => {
  it("measures prefetch lead, settlement, and navigation duration", () => {
    const onComplete = vi.fn();
    const metrics = new NavigationMetrics({ onComplete });

    metrics.recordPrefetchStarted("/products", 100);
    metrics.recordPrefetchSettled("/products", 180);
    metrics.recordNavigationStarted("/products", 250);
    const metric = metrics.recordNavigationCompleted("/products", 400);

    expect(metric).toEqual({
      key: "/products",
      prefetchStartedAt: 100,
      prefetchSettledAt: 180,
      prefetchDurationMs: 80,
      prefetchLeadMs: 150,
      prefetchSettledBeforeNavigation: true,
      navigationStartedAt: 250,
      navigationCompletedAt: 400,
      navigationDurationMs: 150,
    });
    expect(onComplete).toHaveBeenCalledWith(metric);
  });

  it("records ordinary navigation without requiring a prediction", () => {
    const metrics = new NavigationMetrics();
    metrics.recordNavigationStarted("/orders", 50);

    expect(metrics.recordNavigationCompleted("/orders", 75)).toMatchObject({
      navigationDurationMs: 25,
      prefetchSettledBeforeNavigation: false,
    });
  });

  it("drops stale pending records", () => {
    const metrics = new NavigationMetrics({ ttlMs: 100 });
    metrics.recordNavigationStarted("/stale", 0);

    expect(metrics.recordNavigationCompleted("/stale", 100)).toBeUndefined();
  });
});
